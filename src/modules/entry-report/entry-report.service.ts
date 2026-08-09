import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentState } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { EntryReportRepository } from './repositories/entry-report.repository';

const COLA_CONTEO_OK = 'cola_conteo_ok';
const COLA_CONTEO_ERROR = 'cola_conteo_error';

export interface ConteoJobData {
  documentId: string;
  entryReportId: string;
  estado: DocumentState;
}

@Injectable()
export class EntryReportService {
  private readonly logger = new Logger(EntryReportService.name);

  constructor(
    private readonly entryReportRepository: EntryReportRepository,
    private readonly prisma: PrismaService,
    @InjectQueue(COLA_CONTEO_OK) private readonly conteoOkQueue: Queue,
    @InjectQueue(COLA_CONTEO_ERROR) private readonly conteoErrorQueue: Queue,
  ) {}

  /**
   * Productor: publica en la cola de conteo correspondiente cuando un
   * Document llega a un estado terminal.
   *
   * REGLA CRÍTICA: solo debe invocarse en estados terminales DEFINITIVOS
   * (`IA_OK`, `EXCEL_OK`, y `MODEL_ERROR`/`ERROR_OCR` cuando ya se agotaron
   * los reintentos de BullMQ — típicamente desde `@OnWorkerEvent('failed')`).
   * Los processors de model/ocr también escriben `MODEL_ERROR`/`ERROR_OCR`
   * justo ANTES de re-lanzar el error para que BullMQ reintente el job; si
   * este método se llamara ahí, un mismo documento podría publicar hasta 3
   * eventos de error (uno por intento) e inflar artificialmente
   * `numeroDocumentosError`, rompiendo la igualdad
   * `entrada = procesados + error` que usa `findCerradosSinReporte` para
   * decidir cuándo un lote está listo para reportar.
   *
   * Este método NUNCA lanza excepción hacia el llamador: se invoca desde
   * processors y desde handlers `@OnWorkerEvent('failed')`, y un throw acá
   * rompería el flujo principal de procesamiento del documento (que ya
   * completó su trabajo real). Si el encolado falla, se loguea como error y
   * se sigue — en el peor caso, el lote queda sin cerrar y requiere
   * intervención manual, pero el documento en sí no se pierde.
   */
  async publicarEstadoTerminal(
    documentId: string,
    estado: DocumentState,
  ): Promise<void> {
    try {
      const doc = await this.prisma.document.findUnique({
        where: { id: documentId },
        select: { entryReportId: true, conteoRegistrado: true },
      });

      if (!doc?.entryReportId) {
        // Documentos legacy (previos a este cambio) o residuos sin lote de
        // origen conocido: no hay contador de EntryReport que incrementar.
        this.logger.debug(
          `Document ${documentId}: sin entryReportId, se omite el conteo.`,
        );
        return;
      }

      let queue: Queue;
      if (
        estado === DocumentState.IA_OK ||
        estado === DocumentState.EXCEL_OK
      ) {
        queue = this.conteoOkQueue;
      } else if (
        estado === DocumentState.MODEL_ERROR ||
        estado === DocumentState.ERROR_OCR
      ) {
        queue = this.conteoErrorQueue;
      } else {
        this.logger.warn(
          `Document ${documentId}: estado ${estado} no es terminal para efectos de conteo, se omite publicación.`,
        );
        return;
      }

      const payload: ConteoJobData = {
        documentId,
        entryReportId: doc.entryReportId,
        estado,
      };

      const jobId = `conteo-${documentId}`;
      await queue.add('registrar-conteo', payload, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: true,
        removeOnFail: true,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error al publicar estado terminal (${estado}) para Document ${documentId}: ${msg}`,
      );
    }
  }

  /**
   * Consumidor: lógica invocada por los processors de `cola_conteo_ok` /
   * `cola_conteo_error`. Delega la idempotencia real en
   * `registrarConteoIdempotente` (ver comentario ahí sobre por qué el jobId
   * determinístico no basta).
   */
  async registrarConteo(payload: ConteoJobData): Promise<void> {
    const esError =
      payload.estado === DocumentState.MODEL_ERROR ||
      payload.estado === DocumentState.ERROR_OCR;

    const registrado =
      await this.entryReportRepository.registrarConteoIdempotente(
        payload.documentId,
        payload.entryReportId,
        esError,
      );

    if (registrado) {
      this.logger.log(
        `Document ${payload.documentId}: conteo registrado en EntryReport ${payload.entryReportId} (${esError ? 'error' : 'procesado'}).`,
      );
    } else {
      this.logger.debug(
        `Document ${payload.documentId}: conteo omitido, ya estaba registrado (job duplicado/reintento).`,
      );
    }
  }

  /**
   * Descuenta un Document del total de entrada de su lote, para el caso en
   * que el Document se ELIMINA en vez de llegar a un estado terminal (flujo
   * masivo: falta el PDF asociado o la plantilla es inválida, ver
   * `MasivoProcessor.devolverArchivoAOrigen`). Ver el comentario extenso en
   * `EntryReportRepository.decrementarEntrada`.
   *
   * Debe invocarse ANTES de borrar el Document, porque necesita leer su
   * `entryReportId`. Igual que `publicarEstadoTerminal`, nunca lanza: se llama
   * desde el camino de limpieza de un processor y un throw ahí dejaría el
   * archivo a medio devolver.
   */
  async descontarDocumentoDeLote(documentId: string): Promise<void> {
    try {
      const doc = await this.prisma.document.findUnique({
        where: { id: documentId },
        select: { entryReportId: true },
      });

      if (!doc?.entryReportId) {
        return;
      }

      await this.entryReportRepository.decrementarEntrada(doc.entryReportId);
      this.logger.log(
        `Document ${documentId}: descontado del total de entrada de EntryReport ${doc.entryReportId} (se devuelve a origen sin procesar).`,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error al descontar Document ${documentId} de su lote de entrada: ${msg}`,
      );
    }
  }
}
