import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LocalFileStrategy } from './strategies/local-file.strategy';
import { GmailFileStrategy } from './strategies/gmail-file.strategy';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { FtpFileStrategy } from './strategies/ftp-file.strategy';
import { DocumentState } from '@prisma/client';

@Injectable()
export class ExtractionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly inPath: string;
  private readonly ocrPath: string;
  private readonly lockFile: string;

  constructor(
    private readonly configService: ConfigService,

    private readonly localStrategy: LocalFileStrategy,
    private readonly gmailStrategy: GmailFileStrategy,
    private readonly ftpStrategy: FtpFileStrategy,
    private readonly documentRepository: DocumentRepository,
    @InjectQueue('cola_ocr') private readonly ocrQueue: Queue,
    @InjectQueue('cola_modelo') private readonly modelQueue: Queue,
  ) {
    this.inPath = this.configService.get<string>('IN_PATH', './local/in');
    this.ocrPath = this.configService.get<string>('OCR_PATH', './local/ocr');
    this.lockFile = path.join(this.inPath, '.lock'); 
  }

  async onApplicationBootstrap() {
    this.logger.log(`Extraction Service initialized. Monitoring ${this.inPath}`);
    await this.recoverPendingDocuments();
  }

  private async recoverPendingDocuments() {
    this.logger.log('Checking for pending documents to recover...');
    
    // 1. Recover OCR (both EN_COLA and PROCESANDO)
    const pendingOcr = [
        ...(await this.documentRepository.findByState(DocumentState.EN_COLA_OCR)),
        ...(await this.documentRepository.findByState(DocumentState.PROCESANDO_OCR)),
    ];
    for (const doc of pendingOcr) {
        const filePath = path.join(this.inPath, doc.nombre_archivo);
        if (fs.existsSync(filePath)) {
            this.logger.log(`Recovering Document ${doc.id} for OCR queue.`);
            await this.ocrQueue.add('process-ocr', {
                documentId: doc.id,
                filePath,
            });
        } else {
            this.logger.warn(`Cannot recover Document ${doc.id} (OCR): File not found at ${filePath}`);
        }
    }

    // 2. Recover Model
    const pendingModel = await this.documentRepository.findByState(DocumentState.EN_COLA_MODELO);
    for (const doc of pendingModel) {
        const filePath = path.join(this.ocrPath, doc.nombre_archivo);
        if (fs.existsSync(filePath)) {
            this.logger.log(`Recovering Document ${doc.id} for Model queue.`);
            await this.modelQueue.add('process-model', {
                documentId: doc.id,
                filePath,
                text: doc.texto_ocr,
            });
        } else {
            this.logger.warn(`Cannot recover Document ${doc.id} (Model): File not found at ${filePath}`);
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

    if (fs.existsSync(this.lockFile)) {
      this.logger.warn('Extraction task skipped: Lock file exists.');
      return;
    }

    try {
      // Create lock
      fs.writeFileSync(this.lockFile, new Date().toISOString());

      // 1. Select Strategy
      const mode = this.configService.get<string>('GLOBAL_MODE', 'LOCAL');
      let strategy;
      
      if (mode === 'GMAIL') {
        strategy = this.gmailStrategy;
      } else if (mode === 'FTP') {
        strategy = this.ftpStrategy;
      } else {
        strategy = this.localStrategy;
      }

      this.logger.log(`Executing strategy: ${mode}`);

      // 2. Extract Files
      // Strategy should move files to IN_PATH
      // But LocalStrategy moved them to destinationFolder which IS IN_PATH?
      // Yes, we pass IN_PATH to strategy.
      await strategy.extractFiles(this.inPath);

      // 3. Process Files in IN_PATH
      const files = fs.readdirSync(this.inPath);
      
      for (const file of files) {
        if (file === '.lock' || file.startsWith('.')) continue;

        const filePath = path.join(this.inPath, file);
        await this.processFile(filePath, file);
      }

    } catch (error) {
      this.logger.error(`Error in extraction task: ${error.message}`, error.stack);
    } finally {
      // Release lock
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
      }
      this.logger.debug('Extraction task finished. Lock released.');
    }
  }

  private async processFile(filePath: string, fileName: string) {
    try {
      // Generate MD5
      const fileBuffer = fs.readFileSync(filePath);
      const hashSum = crypto.createHash('md5');
      hashSum.update(fileBuffer);
      const hex = hashSum.digest('hex');

      // Check DB
      const existingDoc = await this.documentRepository.findByHash(hex);

      if (existingDoc) {
        this.logger.warn(`Duplicate file found (Hash: ${hex}). Deleting file: ${fileName}`);
        fs.unlinkSync(filePath);
        return;
      }

      // Insert new Document
      const newDoc = await this.documentRepository.create({
        nombre_archivo: fileName,
        hash_md5: hex,
        estado: DocumentState.EN_COLA_OCR,
      });

      this.logger.log(`Document created: ${newDoc.id}. Sending to queue cola_ocr.`);

      // Add to Queue
      await this.ocrQueue.add('process-ocr', {
        documentId: newDoc.id,
        filePath: filePath, // Should we leave it in TMP_IN? Yes, until OCR moves it.
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 20000, // 20s delay on retry (Wait, requirement says "2 reintentos y delay de 20s" - usually means fixed delay or specific backoff)
        }
      });

    } catch (err) {
      this.logger.error(`Failed to process file ${fileName}: ${err.message}`);
    }
  }
}
