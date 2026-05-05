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

@Processor('cola_ocr', {
  concurrency: 5,
  lockDuration: 300000, // 5 minutes to bypass WSL/Docker clock drift
})
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name);
  private readonly ocrPath: string;
  private readonly strategies: TextExtractorStrategy[];

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly configService: ConfigService,
    @InjectQueue('cola_modelo') private readonly modelQueue: Queue,
    private readonly docAiStrategy: DocumentAiStrategy,
    private readonly excelStrategy: ExcelExtractorStrategy,
    private readonly massiveExcelService: MassiveExcelService,
  ) {
    super();
    this.ocrPath = this.configService.get<string>('OCR_PATH', './local/ocr');
    this.strategies = [this.docAiStrategy, this.excelStrategy];
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { documentId, filePath } = job.data;
    this.logger.log(`Processing Job ${job.id} for Document ${documentId}`);

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

        await this.massiveExcelService.process(filePath, baseName);

        // Mover a la carpeta de procesados (OCR_PATH como indica tu flujo)
        const newFilePath = path.join(this.ocrPath, baseName);
        try {
          fs.renameSync(filePath, newFilePath);
        } catch (err) {
          fs.copyFileSync(filePath, newFilePath);
          fs.unlinkSync(filePath);
        }

        await this.documentRepository.updateState(
          documentId,
          DocumentState.EXCEL_OK,
          {
            ocrText:
              'Archivo Excel masivo procesado correctamente (Bypass IA).',
          },
        );
        this.logger.log(
          `Carga masiva finalizada para ${baseName}. Estado: EXCEL_OK`,
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
        if (!fs.existsSync(unsupportedPath))
          fs.mkdirSync(unsupportedPath, { recursive: true });

        const baseName = path.basename(filePath);
        const destination = path.join(unsupportedPath, baseName);

        try {
          fs.renameSync(filePath, destination);
        } catch (err) {
          fs.copyFileSync(filePath, destination);
          fs.unlinkSync(filePath);
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
        await this.documentRepository.updateState(
          documentId,
          DocumentState.OCR_UNREADABLE,
        );
        return;
      }

      // Success
      this.logger.log(`OCR Extracted ${extractedText.length} characters.`);

      // Move file to TMP_OCR_PATH
      // baseName ya está declarado arriba
      const newFilePath = path.join(this.ocrPath, baseName);

      try {
        fs.renameSync(filePath, newFilePath);
      } catch (err) {
        fs.copyFileSync(filePath, newFilePath);
        fs.unlinkSync(filePath);
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
      // Update document state to ERROR_OCR before throwing (for visibility)
      await this.documentRepository.updateState(
        documentId,
        DocumentState.ERROR_OCR,
        {
          ocrText: `Error: ${errorMessage}`,
        },
      );
      // Re-throw so BullMQ can handle retries
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} has completed!`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: any) {
    const { documentId } = job.data;
    this.logger.error(
      `Job ${job.id} (Document ${documentId}) has failed permanently with ${err.message}`,
    );

    // Update document state to ERROR_OCR when all retries are exhausted
    try {
      await this.documentRepository.updateState(
        documentId,
        DocumentState.ERROR_OCR,
        {
          ocrText: `Error definitivo: ${err.message}`,
        },
      );
      this.logger.log(`Document ${documentId} marked as ERROR_OCR in database`);
    } catch (dbError: any) {
      const dbErrorMessage =
        dbError instanceof Error ? dbError.message : String(dbError);
      this.logger.error(`Failed to update document state: ${dbErrorMessage}`);
    }
  }
}
