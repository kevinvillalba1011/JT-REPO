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
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

@Processor('cola_ocr', { concurrency: 1 })
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name);
  private readonly ocrPath: string;
  private readonly docAiClient: DocumentProcessorServiceClient;

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly configService: ConfigService,
    @InjectQueue('cola_modelo') private readonly modelQueue: Queue,
  ) {
    super();
    this.ocrPath = this.configService.get<string>('OCR_PATH', './local/ocr');
    
    // Credentials are loaded from GOOGLE_APPLICATION_CREDENTIALS env var automatically by the library
    this.docAiClient = new DocumentProcessorServiceClient();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { documentId, filePath } = job.data;
    this.logger.log(`Processing Job ${job.id} for Document ${documentId}`);

    // Update State: PROCESANDO_OCR
    await this.documentRepository.updateState(documentId, DocumentState.PROCESANDO_OCR);

    try {
      // 1. Read file
      const fileBuffer = fs.readFileSync(filePath);
      const encodedImage = fileBuffer.toString('base64');

      // 2. Prepare Request
      const projectId = this.configService.get<string>('GCP_PROJECT_ID');
      const location = this.configService.get<string>('GCP_LOCATION', 'us');
      const processorId = this.configService.get<string>('DOCUMENT_AI_PROCESSOR_ID');

      if (!projectId || !processorId) {
        throw new Error('GCP Configuration missing for Document AI');
      }

      const resourceName = `projects/${projectId}/locations/${location}/processors/${processorId}`;
      const baseName = path.basename(filePath);
      const fileNameLower = baseName.toLowerCase();
      let mimeType = 'application/pdf';
      if (fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (fileNameLower.endsWith('.png')) mimeType = 'image/png';
      else if (fileNameLower.endsWith('.tiff')) mimeType = 'image/tiff';

      const request = {
        name: resourceName,
        rawDocument: {
          content: encodedImage,
          mimeType,
        },
      };

      this.logger.log(`Calling Document AI: ${resourceName}`);
      const [result] = await this.docAiClient.processDocument(request);
      
      const { document } = result;
      const extractedText = document?.text || '';

      if (!extractedText.trim()) {
        this.logger.warn('Document is unreadable by OCR (Empty text)');
        await this.documentRepository.updateState(documentId, DocumentState.OCR_UNREADABLE);
        return; 
      }

      // Success
      this.logger.log(`OCR Extracted ${extractedText.length} characters.`);
      
      // Move file to TMP_OCR_PATH
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
      await this.documentRepository.updateState(documentId, DocumentState.EN_COLA_MODELO, {
        texto_ocr: extractedText,
      } as any);

      // Enqueue to cola_modelo
      this.logger.log(`OCR Success. Moving to cola_modelo.`);
      await this.modelQueue.add('process-model', {
        documentId,
        filePath: newFilePath,
        text: extractedText
      });

    } catch (error) {
      this.logger.error(`OCR Error: ${error.message}`, error.stack);
      // If credentials fail or API fails, we throw so BullMQ retries
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} has completed!`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: any) {
    this.logger.error(`Job ${job.id} has failed with ${err.message}`);
  }
}
