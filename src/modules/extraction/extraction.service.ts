import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { Redis } from 'ioredis';
import { LocalFileStrategy } from './strategies/local-file.strategy';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { DocumentState } from '@prisma/client';
import { buildDeterministicJobId } from '@/common/utils/job-id.util';
import { nowBogotaISOString } from '@/common/utils/date.util';

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
    @InjectQueue('cola_ocr') private readonly ocrQueue: Queue,
    @InjectQueue('cola_modelo') private readonly modelQueue: Queue,
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
          // Si el job ya existe (ej. seguía legítimamente en Redis tras un
          // crash y no llegó a procesarse), no rompemos la recuperación del
          // resto de documentos.
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `No se pudo re-encolar process-ocr para Document ${doc.id} (jobId=${jobId}): ${msg}. Puede que ya exista un job en curso.`,
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
        const movedTo = await this.moveToReviewFolder(filePath, doc.fileName);
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
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `No se pudo re-encolar process-model para Document ${doc.id} (jobId=${jobId}): ${msg}. Puede que ya exista un job en curso.`,
          );
        }
      } else {
        this.logger.warn(
          `Cannot recover Document ${doc.id} (Model): File not found at ${filePath}`,
        );
      }
    }
  }

  /**
   * Mueve un archivo a la carpeta de revisión (OCR_UNREADABLE_PATH), igual
   * que `OcrProcessor`/`ModelProcessor`, para los casos en que la
   * recuperación detecta un job ya agotado y debe completar el cierre que el
   * `onFailed` normal no llegó a hacer antes del crash. Retorna la ruta
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
    // Adquirir lock distribuido con TTL de 120 segundos para evitar trabas permanentes
    const lockAcquired = await this.redisClient.set(
      lockKey,
      'locked',
      'EX',
      120,
      'NX',
    );

    if (!lockAcquired) {
      this.logger.warn(
        'Extraction task skipped: Redis Lock exists (task already running).',
      );
      return;
    }

    try {
      // 1. Extract Files (LocalFileStrategy moves files into IN_PATH)
      const extractedFiles = await this.localStrategy.extractFiles(this.inPath);

      // 3. Process Files in IN_PATH
      const files = await fs.promises.readdir(this.inPath);

      for (const file of files) {
        if (file === '.lock' || file.startsWith('.')) continue;

        const filePath = path.join(this.inPath, file);
        const matchedFile = extractedFiles.find((ef) => ef.name === file);
        const originalPath = matchedFile ? matchedFile.originalPath : filePath;
        await this.processFile(filePath, file, originalPath);
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
        await this.documentRepository.create({
          fileName,
          state: DocumentState.FORMATO_NO_SOPORTADO,
          ocrText: `Archivo demasiado pesado (${sizeMb}MB > ${maxSizeMB}MB): NO SOPORTADO.${movedTo ? ` Movido a: ${movedTo}` : ''}`,
        });
        return;
      }

      // jobId determinístico por nombre de archivo: si el cron vuelve a
      // descubrir este mismo archivo en IN_PATH antes de que el job anterior
      // lo mueva (ej. el OCR/modelo tarda más que el intervalo del cron),
      // evitamos crear un segundo Document + un segundo job para el mismo
      // archivo físico, que es la causa raíz de "El archivo físico
      // desapareció de la carpeta de entrada" (ver diagnóstico previo).
      const jobId = buildDeterministicJobId('ocr', fileName);
      const existingJob = await this.ocrQueue.getJob(jobId);
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
        state: DocumentState.EN_COLA_OCR,
      });

      this.logger.log(
        `Document created: ${newDoc.id}. Sending to queue cola_ocr.`,
      );

      // Add to Queue
      try {
        await this.ocrQueue.add(
          'process-ocr',
          {
            documentId: newDoc.id,
            filePath: filePath, // Should we leave it in TMP_IN? Yes, until OCR moves it.
            originalPath: originalPath,
          },
          {
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
        // Carrera entre el getJob() de arriba y este add(): no rompemos el
        // flujo de ingesta por esto. El Document ya quedó registrado; si
        // existe un job hermano en curso para el mismo archivo, ese job es
        // el que terminará de procesarlo.
        const enqueueMsg =
          enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
        this.logger.warn(
          `No se pudo encolar process-ocr para "${fileName}" (jobId=${jobId}): ${enqueueMsg}. Se asume job duplicado ya en curso.`,
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
        } catch (err) {
          this.logger.error(
            `Error cleaning up file ${filePath}: ${err.message}`,
          );
        }
      }
    }
  }
}
