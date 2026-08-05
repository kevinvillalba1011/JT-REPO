import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { DocumentState } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TextExtractorStrategy } from './strategies/text-extractor.strategy';
import { DocumentAiStrategy } from './strategies/document-ai.strategy';
import { ExcelExtractorStrategy } from './strategies/excel-extractor.strategy';
import { IntegrationService } from '../integration/integration.service';
import { isPermanentError } from '@/common/utils/error-classifier.util';
import { buildDeterministicJobId } from '@/common/utils/job-id.util';
import { moverArchivoAFechaDestino } from '@/common/utils/file-destination.util';

@Processor('cola_ocr', {
  concurrency: 5,
  lockDuration: 300000, // 5 minutes to bypass WSL/Docker clock drift
})
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name);
  private readonly ocrPath: string;
  private readonly unreadablePath: string;
  private readonly strategies: TextExtractorStrategy[];

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly configService: ConfigService,
    @InjectQueue('cola_modelo') private readonly modelQueue: Queue,
    private readonly docAiStrategy: DocumentAiStrategy,
    private readonly excelStrategy: ExcelExtractorStrategy,
    private readonly integrationService: IntegrationService,
  ) {
    super();
    this.ocrPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('OCR_PATH', './local/ocr'),
    );
    this.unreadablePath = path.resolve(
      process.cwd(),
      this.configService.get<string>(
        'OCR_UNREADABLE_PATH',
        './local/ocr-unreadable',
      ),
    );
    this.strategies = [this.docAiStrategy, this.excelStrategy];
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { documentId, filePath, originalPath } = job.data;
    this.logger.verbose(`Processing Job ${job.id} for Document ${documentId}`);

    // Verificar si el archivo existe antes de empezar
    if (!fs.existsSync(filePath)) {
      // Idempotencia: antes de asumir que es un error real, verificar si esto
      // es un reintento (tras un move parcial exitoso) o un job duplicado
      // (ej. el cron volvió a encolar el mismo archivo) cuyo hermano YA movió
      // el archivo y avanzó el documento. En ese caso no hay nada roto: solo
      // terminamos en silencio en vez de pisar el estado con un ERROR_OCR falso.
      const baseNameCheck = path.basename(filePath);
      const alreadyMovedToOcrPath = fs.existsSync(
        path.join(this.ocrPath, baseNameCheck),
      );
      const currentDoc = await this.documentRepository.findById(documentId);
      const documentAlreadyAdvanced =
        !!currentDoc &&
        currentDoc.state !== DocumentState.EN_COLA_OCR &&
        currentDoc.state !== DocumentState.PROCESANDO_OCR;

      if (alreadyMovedToOcrPath || documentAlreadyAdvanced) {
        this.logger.log(
          `Job ${job.id} (Document ${documentId}): el archivo ya no está en IN_PATH, pero ya fue procesado ` +
            `por otro intento/job (estado actual: ${currentDoc?.state ?? 'desconocido'}` +
            `${alreadyMovedToOcrPath ? ', archivo ya presente en OCR_PATH' : ''}). ` +
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

    // Update State: PROCESANDO_OCR
    await this.documentRepository.updateState(
      documentId,
      DocumentState.PROCESANDO_OCR,
    );

    try {
      const ext = path.extname(filePath).toLowerCase();
      const baseName = path.basename(filePath);

      // El flujo Excel/CSV masivo ya no pasa por acá — ExtractionService
      // enruta esas extensiones directo a `cola_masivos`/`MasivoProcessor`
      // (cola dedicada, para que no compita por workers con el flujo
      // individual). Este processor vuelve a ser 100% flujo individual.

      const strategy = this.strategies.find((s) => s.canHandle(ext));

      if (!strategy) {
        this.logger.warn(
          `Unsupported file extension: ${ext}. Moving to unsupported folder.`,
        );

        const unsupportedPath = this.configService.get<string>(
          'UNSUPPORTED_PATH',
          './local/unsupported',
        );

        await moverArchivoAFechaDestino(unsupportedPath, filePath);

        await this.documentRepository.updateState(
          documentId,
          DocumentState.FORMATO_NO_SOPORTADO, // Make sure this exists in Prisma or use a generic state
          { ocrText: `Formato no soportado: ${ext}` },
        );
        return;
      }

      // PDF/imágenes: ya NO se ejecuta OCR (Document AI) en esta etapa. El
      // archivo se pasa tal cual al model stage, donde se envía directo a Gemini
      // (multimodal). Document AI queda como FALLBACK dentro de ModelProcessor
      // si el multimodal falla o el archivo es demasiado grande para inline.
      // La detección de "ilegible" se evalúa ahora en el model stage.

      // Move file to TMP_OCR_PATH (baseName ya está declarado arriba)
      const newFilePath = path.join(this.ocrPath, baseName);

      try {
        await fs.promises.rename(filePath, newFilePath);
      } catch (err) {
        await fs.promises.copyFile(filePath, newFilePath);
        await fs.promises.unlink(filePath);
      }

      await this.documentRepository.updateState(
        documentId,
        DocumentState.EN_COLA_MODELO,
        {
          ocrText: '[multimodal] PDF enviado directo a Gemini',
        },
      );

      // Enqueue to cola_modelo with exponential backoff for rate limits.
      // No envolvemos este .add() en try/catch propio: BullMQ nunca lanza
      // excepción si el jobId ya existe (lo trata como duplicado en
      // silencio), así que cualquier excepción acá es un error real. Dejamos
      // que se propague al catch de abajo, que ya sabe clasificar
      // permanente/transitorio, marcar ERROR_OCR y mover el archivo a
      // revisión — reusar esa lógica es más seguro que duplicarla.
      this.logger.log(`Documento listo. Moving to cola_modelo (multimodal).`);
      const modelJobId = buildDeterministicJobId('model', baseName);
      await this.modelQueue.add(
        'process-model',
        {
          documentId,
          filePath: newFilePath,
          originalPath: originalPath || filePath,
        },
        {
          jobId: modelJobId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 15000, // Waits 15s -> 30s -> 60s if model rate limit hits
          },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';

      this.logger.error(
        `OCR Error for Document ${documentId}: ${errorMessage}`,
        errorStack,
      );

      // Errores permanentes (argumento inválido, credenciales, etc.) nunca
      // van a cambiar con un reintento: cortamos de inmediato en vez de
      // gastar 3 intentos con backoff (tiempo y llamadas extra a la API).
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

      // Update document state to ERROR_OCR before throwing (for visibility)
      await this.documentRepository.updateState(
        documentId,
        DocumentState.ERROR_OCR,
        {
          ocrText: `Error: ${errorMessage}`,
        },
      );
      // Re-throw so BullMQ can handle retries (error transitorio)
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

    // Mover el archivo a la carpeta de revisión: si se agotaron los
    // reintentos, el archivo se queda huérfano donde estaba (IN_PATH) y nadie
    // lo vuelve a ver. Lo movemos para que quede visible y recuperable.
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
   * Destino organizado por subcarpeta de fecha (yyyyMMdd, hora Bogotá),
   * igual que OCR_DESTINATION_PATH. Retorna la ruta destino si se movió, o
   * `null` si no había nada que mover.
   */
  private async moveToReviewFolder(filePath?: string): Promise<string | null> {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }

    try {
      return await moverArchivoAFechaDestino(this.unreadablePath, filePath);
    } catch (moveErr: any) {
      this.logger.error(
        `No se pudo mover ${filePath} a la carpeta de revisión: ${moveErr.message}`,
      );
      return null;
    }
  }
}
