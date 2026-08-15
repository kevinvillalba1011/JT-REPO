import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { LocalFileStrategy } from '../extraction/strategies/local-file.strategy';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { EntryReportRepository } from './repositories/entry-report.repository';
import { EntryReportExcelService } from './entry-report-excel.service';
import { ReprocesarCorteDto } from './dto/reprocesar-corte.dto';
import { buildDeterministicJobId } from '@/common/utils/job-id.util';
import {
  MetadatosEntrada,
  normalizarTipoOficioCarpeta,
} from '@/common/utils/ruta-entrada.util';
import { DocumentState } from '@prisma/client';

/**
 * Extensiones que enrutan al flujo masivo (cola_masivos) en vez del flujo
 * individual (cola_ocr). Mismo set que `ExtractionService.MASIVO_EXTENSIONS`.
 */
const MASIVO_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export interface ReprocesarCorteResultado {
  entryReportId: string | null;
  ruta: string | null;
  archivosEncontrados: number;
  archivosEncolados: number;
  reporteRuta: string | null;
}

/**
 * Servicio de soporte para el endpoint manual de relectura de un corte
 * (`POST /entry-report/reprocesar`). Permite a un operador repetir la
 * lectura de una carpeta `[tipo_oficio]/[YYYYMMDD]/CORTE_[n]` (por ejemplo
 * porque se agregaron archivos a mano tras el escaneo automático) y/o
 * regenerar el Excel consolidado de ese corte sin esperar al cron.
 */
@Injectable()
export class EntryReportManualService {
  private readonly logger = new Logger(EntryReportManualService.name);
  private readonly inPath: string;
  private readonly unsupportedPath: string;

  constructor(
    private readonly localStrategy: LocalFileStrategy,
    private readonly documentRepository: DocumentRepository,
    private readonly entryReportRepository: EntryReportRepository,
    private readonly entryReportExcelService: EntryReportExcelService,
    private readonly configService: ConfigService,
    @InjectQueue('cola_ocr') private readonly ocrQueue: Queue,
    @InjectQueue('cola_masivos') private readonly masivosQueue: Queue,
  ) {
    // Mismo patrón que ExtractionService: resolver contra process.cwd() para
    // que la ruta quede siempre absoluta, sin importar si IN_PATH es
    // relativo (local) o absoluto (Docker).
    this.inPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('IN_PATH', './local/in'),
    );
    this.unsupportedPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('UNSUPPORTED_PATH', './local/unsupported'),
    );
  }

  async reprocesarCorte(
    dto: ReprocesarCorteDto,
  ): Promise<ReprocesarCorteResultado> {
    const tipoOficio = normalizarTipoOficioCarpeta(dto.tipoOficio);
    const fechaEntrada = dto.fechaEntrada;
    const corte = dto.corte.toUpperCase();

    this.logger.log(
      `Relectura manual solicitada: tipoOficio=${tipoOficio} fechaEntrada=${fechaEntrada} corte=${corte}`,
    );

    // 1. Relectura: se filtra el descubrimiento a exactamente esta terna.
    const grupos = await this.localStrategy.descubrirGrupos({
      tipoOficio,
      fechaEntrada,
      corte,
    });
    const grupo = grupos[0] ?? null;

    let entryReportId: string | null = null;
    let ruta: string | null = null;
    let archivosEncontrados = 0;
    let archivosEncolados = 0;

    if (grupo) {
      const entryReport = await this.entryReportRepository.upsertPorClave(
        grupo.metadatos,
        grupo.archivos.length,
      );
      entryReportId = entryReport.id;
      ruta = entryReport.ruta;
      archivosEncontrados = grupo.archivos.length;

      const archivos = await this.localStrategy.moverArchivos(
        grupo,
        this.inPath,
      );

      for (const archivo of archivos) {
        const encolado = await this.encolarArchivo(
          archivo.destinationPath,
          archivo.name,
          entryReport.id,
          grupo.metadatos,
        );
        if (encolado) {
          archivosEncolados++;
        }
      }
    } else {
      // No se encontraron archivos en la carpeta esperada. Esto NO es
      // necesariamente un error: si esta terna ya se leyó antes (por el cron
      // o por una relectura manual previa), los archivos de esa corrida ya
      // fueron MOVIDOS fuera de la carpeta fuente (ver
      // LocalFileStrategy.moverArchivos) — es exactamente lo esperado al
      // repetir la lectura de un corte ya procesado, y el operador
      // normalmente solo quiere regenerar el Excel con lo que ya hay en BD.
      // Solo es un error real si ni la carpeta tiene archivos NI existe ya
      // un entry_report para esta terna: en ese caso no hay nada que
      // reportar.
      const existente = await this.entryReportRepository.findByClave(
        tipoOficio,
        fechaEntrada,
        corte,
      );

      if (!existente) {
        const rutaEsperada = `.../${tipoOficio}/${fechaEntrada}/${corte}`;
        throw new NotFoundException(
          `No se encontraron archivos en la carpeta esperada (${rutaEsperada}) ni un entry_report existente para tipoOficio=${tipoOficio} fechaEntrada=${fechaEntrada} corte=${corte}.`,
        );
      }

      entryReportId = existente.id;
      ruta = existente.ruta;
      archivosEncontrados = 0;

      this.logger.log(
        `No se encontraron archivos nuevos para tipoOficio=${tipoOficio} fechaEntrada=${fechaEntrada} corte=${corte}; ` +
          `ya existe entry_report=${existente.id}. Se procede solo a regenerar el reporte.`,
      );
    }

    // 3. Regenerar el Excel consolidado del corte, forzando aunque ya esté
    // marcado como reportado o el lote no esté cerrado: consulta en BD TODOS
    // los documentos de esta fechaEntrada+corte, no solo los recién leídos.
    const resultadoExcel = await this.entryReportExcelService.generarReporte(
      fechaEntrada,
      corte,
      { forzar: true },
    );

    return {
      entryReportId,
      ruta,
      archivosEncontrados,
      archivosEncolados,
      reporteRuta: resultadoExcel?.ruta ?? null,
    };
  }

  /**
   * Encola un archivo recién movido a IN_PATH para su procesamiento.
   *
   * NOTA: esta lógica está DUPLICADA a propósito de
   * `ExtractionService.processFile` (que es `private` y no se puede invocar
   * ni exponer desde aquí sin tocar ese archivo, fuera del alcance de este
   * endpoint). Replica el enrutamiento por extensión, el jobId determinístico,
   * las opciones de cola y el gate de FILE_MAX_SIZE_MB. Si alguno de esos
   * cambia en `ExtractionService.processFile`, hay que revisar y replicar el
   * cambio aquí también.
   */
  private async encolarArchivo(
    filePath: string,
    fileName: string,
    entryReportId: string,
    metadatos: MetadatosEntrada,
  ): Promise<boolean> {
    // Mismo gate que ExtractionService.processFile: un archivo repuesto a
    // mano en la carpeta y recogido por esta relectura manual está sujeto a
    // la misma frontera de tamaño que el escaneo automático (Gemini inline y
    // el fallback de OCR tampoco lo van a poder procesar). Sin este chequeo,
    // un archivo demasiado pesado se encolaría igual en vez de marcarse
    // NO SOPORTADO.
    const stats = await fs.promises.stat(filePath);
    const maxSizeMB = this.configService.get<number>('FILE_MAX_SIZE_MB', 20);
    if (stats.size > maxSizeMB * 1024 * 1024) {
      const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
      this.logger.warn(
        `File ${fileName} (${sizeMb}MB) supera FILE_MAX_SIZE_MB=${maxSizeMB}MB. Marcado NO SOPORTADO.`,
      );
      const movedTo = await this.moveToUnsupported(filePath, fileName);
      // Igual que en ExtractionService.processFile: FORMATO_NO_SOPORTADO
      // nunca alcanza un estado terminal OK/error por la vía normal, así que
      // se cuenta como error del lote aquí mismo (no vía cola de conteo) y se
      // marca conteoRegistrado para que no se recuente después.
      await this.entryReportRepository.incrementarError(entryReportId);
      await this.documentRepository.create({
        fileName,
        state: DocumentState.FORMATO_NO_SOPORTADO,
        ocrText: `Archivo demasiado pesado (${sizeMb}MB > ${maxSizeMB}MB): NO SOPORTADO.${movedTo ? ` Movido a: ${movedTo}` : ''}`,
        rutaArchivo: movedTo,
        conteoRegistrado: true,
        entryReport: { connect: { id: entryReportId } },
        tipoOficio: metadatos.tipoOficio,
        fechaEntrada: metadatos.fechaEntrada,
        corte: metadatos.corte,
      });
      return false;
    }

    const ext = path.extname(fileName).toLowerCase();
    const isMasivo = MASIVO_EXTENSIONS.includes(ext);
    const targetQueue = isMasivo ? this.masivosQueue : this.ocrQueue;
    const jobPrefix = isMasivo ? 'masivo' : 'ocr';
    const jobName = isMasivo ? 'process-masivo' : 'process-ocr';
    const initialState = isMasivo
      ? DocumentState.EN_COLA_MASIVO
      : DocumentState.EN_COLA_OCR;

    const jobId = buildDeterministicJobId(jobPrefix, fileName);
    const existingJob = await targetQueue.getJob(jobId);
    if (existingJob) {
      const jobState = await existingJob.getState();
      const isTerminal =
        jobState === 'completed' ||
        jobState === 'failed' ||
        jobState === 'unknown';
      if (!isTerminal) {
        this.logger.log(
          `Ya existe un job en curso para "${fileName}" (jobId=${jobId}, estado=${jobState}). Se omite el encolado duplicado.`,
        );
        return false;
      }
    }

    const newDoc = await this.documentRepository.create({
      fileName,
      state: initialState,
      entryReport: { connect: { id: entryReportId } },
      tipoOficio: metadatos.tipoOficio,
      fechaEntrada: metadatos.fechaEntrada,
      corte: metadatos.corte,
      prioritario: metadatos.prioritario,
    });

    // Mismo criterio que ExtractionService.processFile: CORTE_n/FID/ salta
    // adelante en la cola.
    const priority = metadatos.prioritario ? 1 : undefined;

    try {
      await targetQueue.add(
        jobName,
        { documentId: newDoc.id, filePath, originalPath: filePath },
        isMasivo
          ? {
              jobId,
              attempts: 1,
              priority,
              removeOnComplete: true,
              removeOnFail: true,
            }
          : {
              jobId,
              attempts: 3,
              backoff: { type: 'exponential', delay: 20000 },
              priority,
              removeOnComplete: true,
              removeOnFail: true,
            },
      );
      return true;
    } catch (enqueueErr: unknown) {
      const enqueueMsg =
        enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
      this.logger.error(
        `Error al encolar ${jobName} para "${fileName}" (jobId=${jobId}): ${enqueueMsg}`,
      );
      await this.documentRepository.updateState(
        newDoc.id,
        DocumentState.ERROR_OCR,
        { ocrText: `Error al encolar: ${enqueueMsg}` },
      );
      return false;
    }
  }

  /**
   * Mueve un archivo a la carpeta de no-soportados (UNSUPPORTED_PATH).
   * Duplicado de `ExtractionService.moveToUnsupported` (privado) por la misma
   * razón que `encolarArchivo`.
   */
  private async moveToUnsupported(
    filePath: string,
    fileName: string,
  ): Promise<string | null> {
    try {
      await fs.promises.access(this.unsupportedPath);
    } catch {
      await fs.promises.mkdir(this.unsupportedPath, { recursive: true });
    }
    const destination = path.join(this.unsupportedPath, fileName);
    try {
      await fs.promises.rename(filePath, destination);
      return destination;
    } catch {
      try {
        await fs.promises.copyFile(filePath, destination);
        await fs.promises.unlink(filePath);
        return destination;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `No se pudo mover ${filePath} a no-soportados: ${msg}`,
        );
        return null;
      }
    }
  }
}
