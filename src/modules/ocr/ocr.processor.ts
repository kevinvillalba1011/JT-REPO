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
import { MassiveExcelService } from './services/massive-excel.service';
import { IntegrationService } from '../integration/integration.service';
import { isPermanentError } from '@/common/utils/error-classifier.util';

@Processor('cola_ocr', {
  concurrency: 5,
  lockDuration: 300000, // 5 minutes to bypass WSL/Docker clock drift
})
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name);
  private readonly ocrPath: string;
  private readonly excelDestinationPath: string;
  private readonly unreadablePath: string;
  private readonly strategies: TextExtractorStrategy[];

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly configService: ConfigService,
    @InjectQueue('cola_modelo') private readonly modelQueue: Queue,
    private readonly docAiStrategy: DocumentAiStrategy,
    private readonly excelStrategy: ExcelExtractorStrategy,
    private readonly massiveExcelService: MassiveExcelService,
    private readonly integrationService: IntegrationService,
  ) {
    super();
    this.ocrPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('OCR_PATH', './local/ocr'),
    );
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
    this.strategies = [this.docAiStrategy, this.excelStrategy];
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { documentId, filePath, originalPath } = job.data;
    this.logger.verbose(`Processing Job ${job.id} for Document ${documentId}`);

    // Verificar si el archivo existe antes de empezar
    if (!fs.existsSync(filePath)) {
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

      // --- LÓGICA DE EXCEL/CSV MASIVO (.xlsx, .xls, .csv) ---
      if (['.xlsx', '.xls', '.csv'].includes(ext)) {
        this.logger.log(
          `Detectado archivo masivo ${ext}: ${baseName}. Iniciando carga directa.`,
        );

        await this.documentRepository.updateState(
          documentId,
          DocumentState.PROCESANDO_EXCEL,
        );

        const batchResult = await this.massiveExcelService.process(
          filePath,
          baseName,
        );

        // Mover al destino final externo de archivos Excel/CSV procesados
        const newFilePath = path.join(this.excelDestinationPath, baseName);
        try {
          await fs.promises.rename(filePath, newFilePath);
        } catch (err) {
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
        return;
      }

      const strategy = this.strategies.find((s) => s.canHandle(ext));

      if (!strategy) {
        this.logger.warn(
          `Unsupported file extension: ${ext}. Moving to unsupported folder.`,
        );

        const unsupportedPath = this.configService.get<string>(
          'UNSUPPORTED_PATH',
          './local/unsupported',
        );

        try {
          await fs.promises.access(unsupportedPath);
        } catch {
          await fs.promises.mkdir(unsupportedPath, { recursive: true });
        }

        const baseName = path.basename(filePath);
        const destination = path.join(unsupportedPath, baseName);

        try {
          await fs.promises.rename(filePath, destination);
        } catch (err) {
          await fs.promises.copyFile(filePath, destination);
          await fs.promises.unlink(filePath);
        }

        await this.documentRepository.updateState(
          documentId,
          DocumentState.FORMATO_NO_SOPORTADO, // Make sure this exists in Prisma or use a generic state
          { ocrText: `Formato no soportado: ${ext}` },
        );
        return;
      }

      const extractedText = await strategy.extractText(filePath);

      if (!extractedText.trim()) {
        this.logger.warn('Document is unreadable by OCR (Empty text)');

        try {
          await fs.promises.access(this.unreadablePath);
        } catch {
          await fs.promises.mkdir(this.unreadablePath, { recursive: true });
        }

        const unreadableBaseName = path.basename(filePath);
        const unreadableDestination = path.join(
          this.unreadablePath,
          unreadableBaseName,
        );

        try {
          await fs.promises.rename(filePath, unreadableDestination);
        } catch {
          await fs.promises.copyFile(filePath, unreadableDestination);
          await fs.promises.unlink(filePath);
        }

        await this.documentRepository.updateState(
          documentId,
          DocumentState.OCR_UNREADABLE,
          { ocrText: `Archivo movido a revisión: ${unreadableDestination}` },
        );
        return;
      }

      // Success
      this.logger.log(`OCR Extracted ${extractedText.length} characters.`);

      // Move file to TMP_OCR_PATH
      // baseName ya está declarado arriba
      const newFilePath = path.join(this.ocrPath, baseName);

      try {
        await fs.promises.rename(filePath, newFilePath);
      } catch (err) {
        await fs.promises.copyFile(filePath, newFilePath);
        await fs.promises.unlink(filePath);
      }

      // Save to DB and Update State
      // Note: Repository updateState expects Prisma.DocumentUpdateInput compatible payload
      // Assuming 'texto_ocr' exists in your Prisma schema. If not, this logical payload will fail at runtime or type check.
      // Based on previous steps, we assume it exists.
      await this.documentRepository.updateState(
        documentId,
        DocumentState.EN_COLA_MODELO,
        {
          ocrText: extractedText,
        },
      );

      // Enqueue to cola_modelo with exponential backoff for rate limits
      this.logger.log(`OCR Success. Moving to cola_modelo.`);
      await this.modelQueue.add(
        'process-model',
        {
          documentId,
          filePath: newFilePath,
          text: extractedText,
          originalPath: originalPath || filePath,
        },
        {
          attempts: 6,
          backoff: {
            type: 'exponential',
            delay: 15000, // Waits 15s -> 30s -> 60s -> 120s if model rate limit hits
          },
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
   * Retorna la ruta destino si se movió, o `null` si no había nada que mover.
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
