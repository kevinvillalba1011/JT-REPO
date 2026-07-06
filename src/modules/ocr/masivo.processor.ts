import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { DocumentState } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { MassiveExcelService } from './services/massive-excel.service';
import { isPermanentError } from '@/common/utils/error-classifier.util';

/**
 * Processor dedicado al flujo masivo (Excel/CSV), en su propia cola
 * `cola_masivos` con concurrencia independiente de `cola_ocr`. Antes, esta
 * lógica vivía inline dentro de `OcrProcessor`, compartiendo sus 5 workers
 * con el flujo individual de PDFs — un batch de Excel grande (con
 * reintentos/backoff en llamadas HTTP externas dentro de
 * `MassiveExcelService.sendBatchWithRetry`) podía ocupar varios de esos
 * workers por un buen rato, dejando PDFs individuales esperando turno en la
 * misma cola. Separar la cola resuelve esa interferencia sin necesitar un
 * proceso/contenedor aparte.
 *
 * Toda la lógica de negocio (parseo del Excel, emparejamiento PDF↔Excel,
 * envío al receptor) sigue viviendo intacta en `MassiveExcelService` — este
 * processor solo la invoca y maneja el ciclo de vida del Document/job,
 * replicando el mismo patrón de manejo de errores que `OcrProcessor`
 * (clasificación permanente/transitorio vía `isPermanentError` + mover a
 * revisión al agotar reintentos), para que la recuperación tras un crash y
 * el comportamiento ante fallos sean consistentes en todo el sistema.
 */
@Injectable()
@Processor('cola_masivos', {
  concurrency: parseInt(process.env.MASIVO_QUEUE_CONCURRENCY || '2', 10),
  lockDuration: 300000, // 5 minutes to bypass WSL/Docker clock drift
})
export class MasivoProcessor extends WorkerHost {
  private readonly logger = new Logger(MasivoProcessor.name);
  private readonly excelDestinationPath: string;
  private readonly unreadablePath: string;

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly configService: ConfigService,
    private readonly massiveExcelService: MassiveExcelService,
  ) {
    super();
    this.excelDestinationPath = path.resolve(
      process.cwd(),
      this.configService.get<string>(
        'EXCEL_DESTINATION_PATH',
        './local/excel-done',
      ),
    );
    this.unreadablePath = path.resolve(
      process.cwd(),
      this.configService.get<string>(
        'OCR_UNREADABLE_PATH',
        './local/ocr-unreadable',
      ),
    );
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { documentId, filePath, originalPath } = job.data;
    this.logger.verbose(
      `Processing Masivo Job ${job.id} for Document ${documentId}`,
    );

    // Verificar si el archivo existe antes de empezar
    if (!fs.existsSync(filePath)) {
      // Idempotencia: mismo criterio que OcrProcessor — antes de asumir que
      // es un error real, verificar si esto es un reintento/job duplicado
      // cuyo hermano YA movió el archivo y avanzó el documento.
      const baseNameCheck = path.basename(filePath);
      const alreadyMovedToExcelDestination = fs.existsSync(
        path.join(this.excelDestinationPath, baseNameCheck),
      );
      const currentDoc = await this.documentRepository.findById(documentId);
      const documentAlreadyAdvanced =
        !!currentDoc &&
        currentDoc.state !== DocumentState.EN_COLA_MASIVO &&
        currentDoc.state !== DocumentState.PROCESANDO_EXCEL;

      if (alreadyMovedToExcelDestination || documentAlreadyAdvanced) {
        this.logger.log(
          `Job ${job.id} (Document ${documentId}): el archivo ya no está en IN_PATH, pero ya fue procesado ` +
            `por otro intento/job (estado actual: ${currentDoc?.state ?? 'desconocido'}` +
            `${alreadyMovedToExcelDestination ? ', archivo ya presente en EXCEL_DESTINATION_PATH' : ''}). ` +
            `Job duplicado/reintento tras move parcial: se ignora sin marcar error.`,
        );
        return;
      }

      this.logger.error(`Archivo no encontrado para procesar: ${filePath}`);
      await this.documentRepository.updateState(
        documentId,
        DocumentState.ERROR_OCR,
        {
          ocrText: `Error: El archivo físico desapareció de la carpeta de entrada.`,
        },
      );
      return;
    }

    // Update State: PROCESANDO_EXCEL
    await this.documentRepository.updateState(
      documentId,
      DocumentState.PROCESANDO_EXCEL,
    );

    try {
      const baseName = path.basename(filePath);
      this.logger.log(
        `Detectado archivo masivo: ${baseName}. Iniciando carga directa.`,
      );

      const batchResult = await this.massiveExcelService.process(
        filePath,
        baseName,
      );

      // Mover al destino final externo de archivos Excel/CSV procesados
      const newFilePath = path.join(this.excelDestinationPath, baseName);
      try {
        await fs.promises.rename(filePath, newFilePath);
      } catch {
        await fs.promises.copyFile(filePath, newFilePath);
        await fs.promises.unlink(filePath);
      }

      // Eliminar archivo original de la carpeta fuente
      if (originalPath && originalPath !== filePath) {
        try {
          await fs.promises.unlink(originalPath);
        } catch (err: any) {
          this.logger.warn(
            `Could not remove original source file ${originalPath}: ${err.message}`,
          );
        }
      }

      const summaryText =
        `Batch loteId=${batchResult.loteId} ` +
        `enviados=${batchResult.enviados} fallidos=${batchResult.fallidos}` +
        (batchResult.filasFallidas.length
          ? ` filasFallidas=[${batchResult.filasFallidas.join(',')}]`
          : '');

      await this.documentRepository.updateState(
        documentId,
        DocumentState.EXCEL_OK,
        { ocrText: summaryText, lotesEnviados: batchResult.lotesEnviados },
      );

      this.logger.log(
        `Carga masiva finalizada para ${baseName}. ${summaryText}`,
      );
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';

      this.logger.error(
        `Masivo Error for Document ${documentId}: ${errorMessage}`,
        errorStack,
      );

      // Errores permanentes (Excel corrupto/ilegible, credenciales, etc.)
      // nunca van a cambiar con un reintento: cortamos de inmediato en vez
      // de gastar 3 intentos con backoff. El resto (ej. receptor externo
      // caído momentáneamente en startBatch) se deja reintentar por BullMQ
      // — el envío por chunk YA tiene su propio reintento interno en
      // `sendBatchWithRetry`, esto cubre fallas ANTES de llegar ahí.
      if (isPermanentError(error)) {
        const movedTo = await this.moveToReviewFolder(filePath);
        await this.documentRepository.updateState(
          documentId,
          DocumentState.ERROR_OCR,
          {
            ocrText: movedTo
              ? `Error permanente (sin reintento): ${errorMessage} | Archivo movido a revisión: ${movedTo}`
              : `Error permanente (sin reintento): ${errorMessage}`,
          },
        );
        this.logger.warn(
          `Document ${documentId}: error permanente detectado, no se reintentará.`,
        );
        return;
      }

      // Update document state to ERROR_OCR before re-throwing for BullMQ retries.
      // Reutiliza ERROR_OCR (mismo criterio que ya usaba el flujo masivo
      // antes de esta separación) en vez de un estado dedicado.
      await this.documentRepository.updateState(
        documentId,
        DocumentState.ERROR_OCR,
        {
          ocrText: `Error: ${errorMessage}`,
        },
      );
      // Re-throw to allow BullMQ to handle retries (error transitorio)
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} has completed!`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: any) {
    const { documentId, filePath } = job.data;
    this.logger.error(
      `Job ${job.id} (Document ${documentId}) has failed permanently with ${err.message}`,
    );

    const movedTo = await this.moveToReviewFolder(filePath);

    // Update document state to ERROR_OCR when all retries are exhausted
    try {
      await this.documentRepository.updateState(
        documentId,
        DocumentState.ERROR_OCR,
        {
          ocrText: movedTo
            ? `Error definitivo: ${err.message} | Archivo movido a revisión: ${movedTo}`
            : `Error definitivo: ${err.message}`,
        },
      );
      this.logger.log(`Document ${documentId} marked as ERROR_OCR in database`);
    } catch (dbError: any) {
      const dbErrorMessage =
        dbError instanceof Error ? dbError.message : String(dbError);
      this.logger.error(`Failed to update document state: ${dbErrorMessage}`);
    }
  }

  /**
   * Mueve un archivo a la carpeta de revisión (OCR_UNREADABLE_PATH) cuando
   * un documento queda en estado de error terminal (permanente o tras
   * agotar reintentos), para que no quede huérfano dentro del contenedor.
   * Mismo mecanismo que OcrProcessor/ModelProcessor.
   */
  private async moveToReviewFolder(filePath?: string): Promise<string | null> {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }

    try {
      await fs.promises.access(this.unreadablePath);
    } catch {
      await fs.promises.mkdir(this.unreadablePath, { recursive: true });
    }

    const destination = path.join(this.unreadablePath, path.basename(filePath));

    try {
      await fs.promises.rename(filePath, destination);
      return destination;
    } catch {
      try {
        await fs.promises.copyFile(filePath, destination);
        await fs.promises.unlink(filePath);
        return destination;
      } catch (moveErr: any) {
        this.logger.error(
          `No se pudo mover ${filePath} a la carpeta de revisión: ${moveErr.message}`,
        );
        return null;
      }
    }
  }
}
