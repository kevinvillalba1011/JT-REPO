import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { Redis } from 'ioredis';
import { PDFDocument } from 'pdf-lib';
import { LocalFileStrategy } from './strategies/local-file.strategy';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { DocumentState } from '@prisma/client';
import { buildDeterministicJobId } from '@/common/utils/job-id.util';
import { nowBogotaISOString } from '@/common/utils/date.util';
import { moverArchivoAFechaDestino } from '@/common/utils/file-destination.util';
import { MetadatosEntrada } from '@/common/utils/ruta-entrada.util';
import { EntryReportRepository } from '../entry-report/repositories/entry-report.repository';
import { EntryReportService } from '../entry-report/entry-report.service';

/**
 * Extensiones que enrutan al flujo masivo (cola_masivos) en vez del flujo
 * individual (cola_ocr). Mismo set que usa `LocalFileStrategy` para
 * restringir la carpeta "masivos" al escaneo.
 */
const MASIVO_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

@Injectable()
export class ExtractionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly inPath: string;
  private readonly ocrPath: string;
  private readonly unsupportedPath: string;
  private readonly unreadablePath: string;
  private readonly redisClient: Redis;

  constructor(
    private readonly configService: ConfigService,

    private readonly localStrategy: LocalFileStrategy,
    private readonly documentRepository: DocumentRepository,
    private readonly entryReportRepository: EntryReportRepository,
    private readonly entryReportService: EntryReportService,
    @InjectQueue('cola_ocr') private readonly ocrQueue: Queue,
    @InjectQueue('cola_modelo') private readonly modelQueue: Queue,
    @InjectQueue('cola_masivos') private readonly masivosQueue: Queue,
  ) {
    this.inPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('IN_PATH', './local/in'),
    );
    this.ocrPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('OCR_PATH', './local/ocr'),
    );
    this.unsupportedPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('UNSUPPORTED_PATH', './local/unsupported'),
    );
    this.unreadablePath = path.resolve(
      process.cwd(),
      this.configService.get<string>(
        'OCR_UNREADABLE_PATH',
        './local/ocr-unreadable',
      ),
    );
    this.redisClient = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
    });
  }

  async onApplicationBootstrap() {
    this.logger.log(
      `Extraction Service initialized. Monitoring ${this.inPath}`,
    );
    await this.recoverPendingDocuments();
  }

  /**
   * Decide qué hacer con un documento "en progreso" al recuperar tras un
   * reinicio, consultando el estado REAL del job en BullMQ (no solo el
   * estado en DB, que puede haber quedado desactualizado si la app crasheó
   * justo antes de que el handler `onFailed` terminara de escribirlo).
   *
   * Si BullMQ ya marcó el job como `failed` con los intentos agotados, NO
   * debe reencolarse — eso sería darle al documento un "4to intento por su
   * cuenta" después de haber agotado los 3 reintentos configurados. En ese
   * caso se debe escribir directamente el estado terminal de error.
   *
   * Si el job no existe (limpiado por removeOnComplete/removeOnFail, o
   * nunca existió bajo ese jobId) o no está en estado terminal `failed`, es
   * seguro reencolar: es un crash genuino a mitad de proceso.
   */
  private async resolveRecoveryAction(
    queue: Queue,
    jobId: string,
  ): Promise<{ exhausted: boolean; attemptsMade: number }> {
    const existingJob = await queue.getJob(jobId);
    if (!existingJob) {
      return { exhausted: false, attemptsMade: 0 };
    }

    const state = await existingJob.getState();
    const attemptsMade = existingJob.attemptsMade ?? 0;
    if (state !== 'failed') {
      return { exhausted: false, attemptsMade };
    }

    const maxAttempts = existingJob.opts?.attempts ?? 1;
    return { exhausted: attemptsMade >= maxAttempts, attemptsMade };
  }

  private async recoverPendingDocuments() {
    this.logger.verbose('Checking for pending documents to recover...');

    // 1. Recover OCR (both EN_COLA and PROCESANDO)
    const pendingOcr = [
      ...(await this.documentRepository.findByState(DocumentState.EN_COLA_OCR)),
      ...(await this.documentRepository.findByState(
        DocumentState.PROCESANDO_OCR,
      )),
    ];
    for (const doc of pendingOcr) {
      const filePath = path.join(this.inPath, doc.fileName);
      const jobId = buildDeterministicJobId('ocr', doc.fileName);
      const recovery = await this.resolveRecoveryAction(this.ocrQueue, jobId);

      if (recovery.exhausted) {
        const movedTo = await this.moveToReviewFolderDated(
          filePath,
          doc.fileName,
        );
        await this.documentRepository.updateState(
          doc.id,
          DocumentState.ERROR_OCR,
          {
            ocrText: movedTo
              ? `Error definitivo (detectado en recuperación tras reinicio): intentos agotados en BullMQ | Archivo movido a revisión: ${movedTo}`
              : `Error definitivo (detectado en recuperación tras reinicio): intentos agotados en BullMQ.`,
          },
        );
        this.logger.warn(
          `Document ${doc.id}: job ${jobId} ya agotó sus intentos en BullMQ antes del reinicio. Marcado ERROR_OCR sin reencolar.`,
        );
        // Error definitivo (intentos ya agotados en BullMQ): cuenta para el
        // cierre del lote de EntryReport.
        await this.entryReportService.publicarEstadoTerminal(
          doc.id,
          DocumentState.ERROR_OCR,
        );
        continue;
      }

      if (fs.existsSync(filePath)) {
        this.logger.log(`Recovering Document ${doc.id} for OCR queue.`);
        try {
          await this.ocrQueue.add(
            'process-ocr',
            { documentId: doc.id, filePath },
            { jobId, removeOnComplete: true, removeOnFail: true },
          );
        } catch (err: unknown) {
          // BullMQ NUNCA lanza excepción si el jobId ya existe (devuelve el
          // job existente en silencio) — por lo tanto esto es siempre un
          // error real (ej. jobId inválido, Redis caído), no un duplicado.
          // No lo enmascaramos: se loguea como error y se marca el
          // documento, para no dejarlo huérfano en su estado "en progreso".
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Error al re-encolar process-ocr para Document ${doc.id} (jobId=${jobId}): ${msg}`,
          );
          await this.documentRepository.updateState(
            doc.id,
            DocumentState.ERROR_OCR,
            { ocrText: `Error al re-encolar en recuperación: ${msg}` },
          );
        }
      } else {
        this.logger.warn(
          `Cannot recover Document ${doc.id} (OCR): File not found at ${filePath}`,
        );
      }
    }

    // 2. Recover Model (EN_COLA_MODELO y PROCESANDO_MODELO: este último
    // estaba huérfano — un crash durante el procesamiento del modelo nunca
    // se recuperaba, dejando el documento atascado para siempre).
    const pendingModel = [
      ...(await this.documentRepository.findByState(
        DocumentState.EN_COLA_MODELO,
      )),
      ...(await this.documentRepository.findByState(
        DocumentState.PROCESANDO_MODELO,
      )),
    ];
    for (const doc of pendingModel) {
      const filePath = path.join(this.ocrPath, doc.fileName);
      const jobId = buildDeterministicJobId('model', doc.fileName);
      const recovery = await this.resolveRecoveryAction(this.modelQueue, jobId);

      if (recovery.exhausted) {
        const movedTo = await this.moveToReviewFolderDated(
          filePath,
          doc.fileName,
        );
        await this.documentRepository.updateState(
          doc.id,
          DocumentState.MODEL_ERROR,
          {
            jsonModel: {
              error:
                'Intentos agotados en BullMQ (detectado en recuperación tras reinicio).',
              errorType: 'permanent_failure',
              timestamp: nowBogotaISOString(),
              attempts: recovery.attemptsMade,
              ...(movedTo ? { archivoMovido: movedTo } : {}),
            },
          },
        );
        this.logger.warn(
          `Document ${doc.id}: job ${jobId} ya agotó sus intentos en BullMQ antes del reinicio. Marcado MODEL_ERROR sin reencolar.`,
        );
        // Error definitivo (intentos ya agotados en BullMQ): cuenta para el
        // cierre del lote de EntryReport.
        await this.entryReportService.publicarEstadoTerminal(
          doc.id,
          DocumentState.MODEL_ERROR,
        );
        continue;
      }

      if (fs.existsSync(filePath)) {
        this.logger.log(`Recovering Document ${doc.id} for Model queue.`);
        try {
          await this.modelQueue.add(
            'process-model',
            { documentId: doc.id, filePath, text: doc.ocrText },
            { jobId, removeOnComplete: true, removeOnFail: true },
          );
        } catch (err: unknown) {
          // Igual que en el loop de OCR: un duplicado real nunca lanza en
          // BullMQ, así que esto es un error genuino. Se marca el documento
          // en vez de dejarlo huérfano en EN_COLA_MODELO/PROCESANDO_MODELO.
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Error al re-encolar process-model para Document ${doc.id} (jobId=${jobId}): ${msg}`,
          );
          await this.documentRepository.updateState(
            doc.id,
            DocumentState.MODEL_ERROR,
            {
              jsonModel: {
                error: `Error al re-encolar en recuperación: ${msg}`,
                errorType: 'permanent_failure',
                timestamp: nowBogotaISOString(),
              },
            },
          );
        }
      } else {
        this.logger.warn(
          `Cannot recover Document ${doc.id} (Model): File not found at ${filePath}`,
        );
      }
    }

    // 3. Recover Masivo (EN_COLA_MASIVO y PROCESANDO_EXCEL). El archivo del
    // flujo masivo nunca se mueve de IN_PATH hasta que MasivoProcessor lo
    // envía a EXCEL_DESTINATION_PATH tras procesar con éxito, así que se
    // busca en el mismo `this.inPath` que el flujo OCR.
    const pendingMasivo = [
      ...(await this.documentRepository.findByState(
        DocumentState.EN_COLA_MASIVO,
      )),
      ...(await this.documentRepository.findByState(
        DocumentState.PROCESANDO_EXCEL,
      )),
    ];
    for (const doc of pendingMasivo) {
      const filePath = path.join(this.inPath, doc.fileName);
      const jobId = buildDeterministicJobId('masivo', doc.fileName);
      const recovery = await this.resolveRecoveryAction(
        this.masivosQueue,
        jobId,
      );

      if (recovery.exhausted) {
        const movedTo = await this.moveToReviewFolder(filePath, doc.fileName);
        await this.documentRepository.updateState(
          doc.id,
          DocumentState.ERROR_OCR,
          {
            ocrText: movedTo
              ? `Error definitivo (detectado en recuperación tras reinicio): intentos agotados en BullMQ | Archivo movido a revisión: ${movedTo}`
              : `Error definitivo (detectado en recuperación tras reinicio): intentos agotados en BullMQ.`,
          },
        );
        this.logger.warn(
          `Document ${doc.id}: job ${jobId} ya agotó sus intentos en BullMQ antes del reinicio. Marcado ERROR_OCR sin reencolar.`,
        );
        // Error definitivo (intentos ya agotados en BullMQ): cuenta para el
        // cierre del lote de EntryReport.
        await this.entryReportService.publicarEstadoTerminal(
          doc.id,
          DocumentState.ERROR_OCR,
        );
        continue;
      }

      if (fs.existsSync(filePath)) {
        this.logger.log(`Recovering Document ${doc.id} for Masivo queue.`);
        try {
          await this.masivosQueue.add(
            'process-masivo',
            { documentId: doc.id, filePath },
            { jobId, removeOnComplete: true, removeOnFail: true },
          );
        } catch (err: unknown) {
          // Igual que en los loops de OCR/Model: un duplicado real nunca
          // lanza en BullMQ, así que esto es un error genuino.
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Error al re-encolar process-masivo para Document ${doc.id} (jobId=${jobId}): ${msg}`,
          );
          await this.documentRepository.updateState(
            doc.id,
            DocumentState.ERROR_OCR,
            { ocrText: `Error al re-encolar en recuperación: ${msg}` },
          );
        }
      } else {
        this.logger.warn(
          `Cannot recover Document ${doc.id} (Masivo): File not found at ${filePath}`,
        );
      }
    }
  }

  /**
   * Igual que `moveToReviewFolder`, pero para los call sites del flujo
   * individual (OCR/Model) en recuperación: organiza el destino en
   * subcarpeta de fecha (yyyyMMdd, hora Bogotá), igual que
   * `OcrProcessor`/`ModelProcessor` ya hacen para ese mismo escenario. El
   * flujo masivo sigue usando `moveToReviewFolder` (plano) sin cambios.
   */
  private async moveToReviewFolderDated(
    filePath: string,
    fileName: string,
  ): Promise<string | null> {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      return await moverArchivoAFechaDestino(
        this.unreadablePath,
        filePath,
        fileName,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `No se pudo mover ${filePath} a la carpeta de revisión: ${msg}`,
      );
      return null;
    }
  }

  /**
   * Mueve un archivo a la carpeta de revisión (OCR_UNREADABLE_PATH), igual
   * que `OcrProcessor`/`ModelProcessor`, para los casos en que la
   * recuperación detecta un job ya agotado y debe completar el cierre que el
   * `onFailed` normal no llegó a hacer antes del crash. Usado únicamente por
   * el flujo masivo (destino plano, sin subcarpeta de fecha — ver
   * `moveToReviewFolderDated` para el flujo individual). Retorna la ruta
   * destino si se movió, o `null` si no había archivo que mover.
   */
  private async moveToReviewFolder(
    filePath: string,
    fileName: string,
  ): Promise<string | null> {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      await fs.promises.access(this.unreadablePath);
    } catch {
      await fs.promises.mkdir(this.unreadablePath, { recursive: true });
    }

    const destination = path.join(this.unreadablePath, fileName);
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
          `No se pudo mover ${filePath} a la carpeta de revisión: ${msg}`,
        );
        return null;
      }
    }
  }

  /**
   * Verifica que el PDF tenga una estructura mínimamente válida (header,
   * xref, trailer) ANTES de encolarlo, para no gastar un ciclo completo de
   * OCR/Gemini en un archivo que nunca se va a poder leer. NO valida que el
   * CONTENIDO sea legible/tenga texto útil — eso lo sigue evaluando la
   * etapa de modelo más adelante; esto solo descarta basura/truncados.
   * `ignoreEncryption: true` evita marcar como "corrupto" un PDF que
   * simplemente está protegido con contraseña (estructura válida, solo
   * cifrado) — ese caso lo sigue manejando el flujo normal más adelante.
   * Devuelve `null` si el PDF abre bien, o el mensaje de error si no.
   */
  private async validarIntegridadPdf(filePath: string): Promise<string | null> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      await PDFDocument.load(buffer, { ignoreEncryption: true });
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  // The schedule is dynamic from configuration, but we need a fixed decorator or a Dynamic Module approach.
  // NestJS @Cron accepts a string which can be a const, but not directly `config.get()`.
  // However, we can use `Cron(ConfigService.get('CRON_SCHEDULE'))` ONLY if it's evaluated at decorator time (not possible usually).
  // Standard workaround: use `Cron(process.env.CRON_EXTRACTION_SCHEDULE || CronExpression.EVERY_MINUTE)`
  // Or add the job programmatically.
  // For simplicity and robustness, I will use a fallback constant here but rely on the environment variable via process.env because decorators run at import time.
  @Cron(process.env.CRON_EXTRACTION_SCHEDULE || '*/15 * * * * *')
  async handleCron() {
    this.logger.debug('Starting scheduled extraction task...');

    const lockKey = 'extraction:lock';
    // TTL del lock configurable (default 600s / 10min): antes bastaba con
    // 120s porque un tick solo escaneaba y movía un directorio plano. Ahora
    // un tick puede recorrer VARIAS carpetas CORTE_[n] en secuencia (una por
    // cada lote descubierto), cada una con su propio registro de
    // EntryReport y su propio lote de archivos encolados, así que el tick
    // completo puede tardar bastante más que antes. Un TTL corto liberaría
    // el lock a mitad de un tick legítimo y dejaría correr dos ticks en
    // paralelo sobre el mismo filesystem.
    const lockTtlSeconds = this.configService.get<number>(
      'EXTRACTION_LOCK_TTL_SECONDS',
      600,
    );
    const lockAcquired = await this.redisClient.set(
      lockKey,
      'locked',
      'EX',
      lockTtlSeconds,
      'NX',
    );

    if (!lockAcquired) {
      this.logger.warn(
        'Extraction task skipped: Redis Lock exists (task already running).',
      );
      return;
    }

    try {
      // 1. Descubrir los grupos de entrada (carpetas CORTE_[n] o legacy) SIN
      // moverlos todavía. `descubrirGrupos` ya los devuelve en el orden en
      // que deben procesarse: legacy de raíz primero, luego por
      // fechaEntrada ascendente y, dentro de cada fecha, por número de
      // CORTE_[n] ascendente.
      const grupos = await this.localStrategy.descubrirGrupos();
      const nombresProcesadosEnEsteTick = new Set<string>();

      for (const grupo of grupos) {
        try {
          // 2. Registrar el lote ANTES de mover archivos: el requisito es
          // que el conteo de entrada refleje "lo que había en la carpeta"
          // en el momento del descubrimiento, no lo que sobrevive al mover
          // (que podría fallar parcialmente por I/O). Si el proceso muere
          // justo después de este paso pero antes de mover, el próximo tick
          // vuelve a descubrir el mismo grupo (los archivos siguen en la
          // carpeta fuente) y `upsertPorClave` suma sobre el mismo registro
          // en vez de duplicarlo.
          const entryReport = await this.entryReportRepository.upsertPorClave(
            grupo.metadatos,
            grupo.archivos.length,
          );

          // 3. Mover los archivos del grupo a IN_PATH.
          const archivos = await this.localStrategy.moverArchivos(
            grupo,
            this.inPath,
          );

          // `moverArchivos` loguea y continúa si un archivo concreto falla al
          // moverse (I/O, archivo bloqueado por otro proceso), así que puede
          // devolver menos archivos de los que se contaron en el paso 2. Ese
          // archivo sigue en la carpeta fuente y el próximo tick lo va a
          // descubrir y contar OTRA VEZ: sin este descuento el contador de
          // entrada crecería en cada tick y `entrada = procesados + error`
          // nunca se cumpliría, dejando el lote abierto para siempre.
          const noMovidos = grupo.archivos.length - archivos.length;
          if (noMovidos > 0) {
            this.logger.warn(
              `Grupo ${grupo.metadatos.tipoOficio}/${grupo.metadatos.fechaEntrada}/${grupo.metadatos.corte}: ${noMovidos} archivo(s) no se pudieron mover; se descuentan del total de entrada (se recontarán en el próximo tick).`,
            );
            await this.entryReportRepository.decrementarEntrada(
              entryReport.id,
              noMovidos,
            );
          }

          // 4. Encolar TODOS los archivos de este corte antes de pasar al
          // siguiente grupo, para respetar el orden de llegada entre
          // cortes (no intercalar el procesamiento de corte 2 con el de
          // corte 1).
          for (const archivo of archivos) {
            nombresProcesadosEnEsteTick.add(archivo.name);
            await this.processFile(
              archivo.destinationPath,
              archivo.name,
              archivo.originalPath,
              entryReport.id,
              grupo.metadatos,
            );
          }
        } catch (error: unknown) {
          // Un corte roto (ej. error de I/O al mover, o falla creando el
          // EntryReport) no debe abortar el resto de los grupos descubiertos
          // en este tick: se loguea y se continúa con el siguiente.
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Error procesando el grupo ${grupo.metadatos.tipoOficio}/${grupo.metadatos.fechaEntrada}/${grupo.metadatos.corte}: ${errMsg}`,
          );
        }
      }

      // 5. Residuos en IN_PATH que no vinieron de ningún grupo descubierto
      // en ESTE tick (típicamente: un reinicio a mitad del tick anterior,
      // que ya movió el archivo a IN_PATH pero no llegó a encolarlo). Se
      // procesan como antes de este cambio, sin metadata de lote de origen.
      const filesEnIn = await fs.promises.readdir(this.inPath);
      for (const file of filesEnIn) {
        if (file === '.lock' || file.startsWith('.')) continue;
        if (nombresProcesadosEnEsteTick.has(file)) continue;

        const filePath = path.join(this.inPath, file);
        await this.processFile(filePath, file, filePath, null, null);
      }
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : '';
      this.logger.error(`Error in extraction task: ${errMsg}`, errStack);
    } finally {
      // Release lock
      await this.redisClient.del(lockKey);
      this.logger.debug('Extraction task finished. Redis Lock released.');
    }
  }

  private async processFile(
    filePath: string,
    fileName: string,
    originalPath: string,
    entryReportId: string | null,
    metadatos: MetadatosEntrada | null,
  ) {
    try {
      const stats = await fs.promises.stat(filePath);
      const maxSizeMB = this.configService.get<number>('FILE_MAX_SIZE_MB', 20);
      if (stats.size > maxSizeMB * 1024 * 1024) {
        // Frontera de procesamiento: un archivo por encima de FILE_MAX_SIZE_MB es
        // demasiado pesado para CUALQUIER vía de extracción individual:
        //   - Gemini multimodal inline está acotado a GEMINI_INLINE_MAX_MB.
        //   - El fallback de Document AI (OCR) tampoco admite archivos tan grandes.
        // En vez de borrarlo en silencio, se registra como NO SOPORTADO y se mueve
        // a la carpeta de no-soportados (UNSUPPORTED_PATH) para revisión manual.
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
        this.logger.warn(
          `File ${fileName} (${sizeMb}MB) supera FILE_MAX_SIZE_MB=${maxSizeMB}MB. Marcado NO SOPORTADO.`,
        );
        const movedTo = await this.moveToUnsupported(filePath, fileName);
        // FORMATO_NO_SOPORTADO nunca va a alcanzar un estado terminal OK ni
        // de error por la vía normal (no pasa por OCR/modelo/masivo), así
        // que `publicarEstadoTerminal` jamás se dispara para este documento.
        // Si simplemente lo dejáramos en `numeroDocumentosEntrada` sin
        // contarlo en procesados ni en error, el lote (EntryReport) nunca
        // cumpliría `entrada = procesados + error` y jamás cerraría. Por eso
        // se incrementa el contador de error del lote AQUÍ MISMO (en vez de
        // vía la cola de conteo) y se marca `conteoRegistrado: true` en la
        // misma creación, para que si algún día este documento pasara por
        // `registrarConteoIdempotente` no se cuente una segunda vez.
        if (entryReportId) {
          await this.entryReportRepository.incrementarError(entryReportId);
        }
        await this.documentRepository.create({
          fileName,
          state: DocumentState.FORMATO_NO_SOPORTADO,
          ocrText: `Archivo demasiado pesado (${sizeMb}MB > ${maxSizeMB}MB): NO SOPORTADO.${movedTo ? ` Movido a: ${movedTo}` : ''}`,
          conteoRegistrado: true,
          ...(entryReportId
            ? { entryReport: { connect: { id: entryReportId } } }
            : {}),
          ...(metadatos
            ? {
                tipoOficio: metadatos.tipoOficio,
                fechaEntrada: metadatos.fechaEntrada,
                corte: metadatos.corte,
              }
            : {}),
        });
        return;
      }

      const ext = path.extname(fileName).toLowerCase();

      // Validación de integridad SOLO para PDF (el resto de extensiones del
      // flujo individual son imágenes, sin un chequeo de estructura análogo;
      // Excel/CSV van a cola_masivos y no se tocan acá). Se hace ANTES de
      // encolar para no gastar un ciclo completo de OCR/Gemini en un archivo
      // que nunca se va a poder leer — antes esto fallaba silenciosamente
      // más adelante en el pipeline (o quedaba atascado) en vez de marcarse
      // como error de inmediato.
      if (ext === '.pdf') {
        const errorIntegridad = await this.validarIntegridadPdf(filePath);
        if (errorIntegridad) {
          this.logger.warn(
            `PDF corrupto/ilegible: ${fileName} — ${errorIntegridad}. Marcado ERROR_OCR sin encolar.`,
          );
          const movedTo = await this.moveToReviewFolderDated(
            filePath,
            fileName,
          );
          // Mismo motivo que en el bloque de "demasiado pesado" arriba: este
          // documento nunca va a pasar por OCR/modelo, así que hay que
          // cerrar la cuenta del EntryReport (entrada = procesados + error)
          // acá mismo en vez de esperar a `registrarConteoIdempotente`.
          if (entryReportId) {
            await this.entryReportRepository.incrementarError(entryReportId);
          }
          await this.documentRepository.create({
            fileName,
            state: DocumentState.ERROR_OCR,
            ocrText: `PDF corrupto o con estructura inválida (no se pudo abrir antes de encolar): ${errorIntegridad}.${movedTo ? ` Movido a: ${movedTo}` : ''}`,
            conteoRegistrado: true,
            ...(entryReportId
              ? { entryReport: { connect: { id: entryReportId } } }
              : {}),
            ...(metadatos
              ? {
                  tipoOficio: metadatos.tipoOficio,
                  fechaEntrada: metadatos.fechaEntrada,
                  corte: metadatos.corte,
                }
              : {}),
          });
          return;
        }
      }

      // Enrutamiento por extensión: Excel/CSV va a cola_masivos (procesador
      // dedicado, sin competir por workers con el flujo individual de
      // PDFs/imágenes); el resto sigue a cola_ocr como siempre.
      const isMasivo = MASIVO_EXTENSIONS.includes(ext);
      const targetQueue = isMasivo ? this.masivosQueue : this.ocrQueue;
      const jobPrefix = isMasivo ? 'masivo' : 'ocr';
      const jobName = isMasivo ? 'process-masivo' : 'process-ocr';
      const initialState = isMasivo
        ? DocumentState.EN_COLA_MASIVO
        : DocumentState.EN_COLA_OCR;

      // jobId determinístico por nombre de archivo: si el cron vuelve a
      // descubrir este mismo archivo en IN_PATH antes de que el job anterior
      // lo mueva (ej. el OCR/modelo tarda más que el intervalo del cron),
      // evitamos crear un segundo Document + un segundo job para el mismo
      // archivo físico, que es la causa raíz de "El archivo físico
      // desapareció de la carpeta de entrada" (ver diagnóstico previo).
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
          return;
        }
      }

      // Insert new Document
      const newDoc = await this.documentRepository.create({
        fileName: fileName,
        state: initialState,
        ...(entryReportId
          ? { entryReport: { connect: { id: entryReportId } } }
          : {}),
        ...(metadatos
          ? {
              tipoOficio: metadatos.tipoOficio,
              fechaEntrada: metadatos.fechaEntrada,
              corte: metadatos.corte,
            }
          : {}),
      });

      this.logger.log(
        `Document created: ${newDoc.id}. Sending to queue ${isMasivo ? 'cola_masivos' : 'cola_ocr'}.`,
      );

      // Add to Queue.
      // cola_masivos usa attempts: 1 (sin reintento a nivel BullMQ): el
      // envío por chunk YA reintenta internamente hasta 3 veces con backoff
      // (MassiveExcelService.sendBatchWithRetry); reintentar el JOB completo
      // repetiría el parseo del Excel y el reenvío desde cero, arriesgando
      // envíos duplicados al servicio externo. cola_ocr mantiene attempts: 3
      // como hasta ahora.
      try {
        await targetQueue.add(
          jobName,
          {
            documentId: newDoc.id,
            filePath: filePath, // Should we leave it in TMP_IN? Yes, until OCR moves it.
            originalPath: originalPath,
          },
          isMasivo
            ? {
                jobId,
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: true,
              }
            : {
                jobId,
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 20000, // 20s delay on retry (Wait, requirement says "2 reintentos y delay de 20s" - usually means fixed delay or specific backoff)
                },
                removeOnComplete: true,
                removeOnFail: true,
              },
        );
      } catch (enqueueErr: unknown) {
        // BullMQ NUNCA lanza excepción si el jobId ya existe (devuelve el
        // job existente en silencio, ver handleDuplicatedJob) — por lo tanto
        // esto SIEMPRE es un error real (jobId inválido, Redis caído, etc.),
        // nunca un duplicado legítimo. No lo enmascaramos como tal: se
        // loguea como error y se marca el Document recién creado, para no
        // dejarlo huérfano en su estado "en cola" sin job ni explicación.
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
      }
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to process file ${fileName}: ${errMsg}`);
    }
  }

  /**
   * Mueve un archivo a la carpeta de no-soportados (UNSUPPORTED_PATH),
   * creándola si no existe. Retorna la ruta destino o `null` si no se pudo mover.
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

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldFiles() {
    this.logger.verbose('Starting daily cleanup of old files...');
    const retentionDays = this.configService.get<number>(
      'FILE_RETENTION_DAYS',
      7,
    );
    const cleanAll =
      this.configService.get<string>('FILE_CLEANUP_ALL_FOLDERS', 'true') ===
      'true';
    const now = Date.now();
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;

    const pathsToClean = cleanAll
      ? [this.inPath, this.ocrPath]
      : [this.ocrPath];

    for (const folder of pathsToClean) {
      try {
        await fs.promises.access(folder);
      } catch {
        continue;
      }
      const files = await fs.promises.readdir(folder);
      for (const file of files) {
        if (file === '.lock' || file === '.gitkeep') continue;
        const filePath = path.join(folder, file);
        try {
          const stats = await fs.promises.stat(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            await fs.promises.unlink(filePath);
            this.logger.log(`Cleaned up old file: ${filePath}`);
          }
        } catch (err: any) {
          this.logger.error(
            `Error cleaning up file ${filePath}: ${err.message}`,
          );
        }
      }
    }
  }
}
