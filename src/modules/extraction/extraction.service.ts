import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';
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
  private readonly redisClient: Redis;

  constructor(
    private readonly configService: ConfigService,

    private readonly localStrategy: LocalFileStrategy,
    private readonly gmailStrategy: GmailFileStrategy,
    private readonly ftpStrategy: FtpFileStrategy,
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

  private async recoverPendingDocuments() {
    this.logger.log('Checking for pending documents to recover...');

    // 1. Recover OCR (both EN_COLA and PROCESANDO)
    const pendingOcr = [
      ...(await this.documentRepository.findByState(DocumentState.EN_COLA_OCR)),
      ...(await this.documentRepository.findByState(
        DocumentState.PROCESANDO_OCR,
      )),
    ];
    for (const doc of pendingOcr) {
      const filePath = path.join(this.inPath, doc.fileName);
      if (fs.existsSync(filePath)) {
        this.logger.log(`Recovering Document ${doc.id} for OCR queue.`);
        await this.ocrQueue.add('process-ocr', {
          documentId: doc.id,
          filePath,
        });
      } else {
        this.logger.warn(
          `Cannot recover Document ${doc.id} (OCR): File not found at ${filePath}`,
        );
      }
    }

    // 2. Recover Model
    const pendingModel = await this.documentRepository.findByState(
      DocumentState.EN_COLA_MODELO,
    );
    for (const doc of pendingModel) {
      const filePath = path.join(this.ocrPath, doc.fileName);
      if (fs.existsSync(filePath)) {
        this.logger.log(`Recovering Document ${doc.id} for Model queue.`);
        await this.modelQueue.add('process-model', {
          documentId: doc.id,
          filePath,
          text: doc.ocrText,
        });
      } else {
        this.logger.warn(
          `Cannot recover Document ${doc.id} (Model): File not found at ${filePath}`,
        );
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
      const files = await fs.promises.readdir(this.inPath);

      for (const file of files) {
        if (file === '.lock' || file.startsWith('.')) continue;

        const filePath = path.join(this.inPath, file);
        await this.processFile(filePath, file);
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

  private async processFile(filePath: string, fileName: string) {
    try {
      const stats = await fs.promises.stat(filePath);
      const maxSizeMB = this.configService.get<number>('FILE_MAX_SIZE_MB', 20);
      if (stats.size > maxSizeMB * 1024 * 1024) {
        this.logger.warn(
          `File ${fileName} exceeds max size of ${maxSizeMB}MB. Deleting.`,
        );
        await fs.promises.unlink(filePath);
        return;
      }

      // Generate MD5 using stream
      const hex = await this.calculateFileHash(filePath);

      // Check DB
      const existingDoc = await this.documentRepository.findByHash(hex);

      if (existingDoc) {
        const duplicatesPath = this.configService.get<string>(
          'DUPLICATES_PATH',
          './local/duplicates',
        );

        try {
          await fs.promises.access(duplicatesPath);
        } catch {
          await fs.promises.mkdir(duplicatesPath, { recursive: true });
        }

        const baseName = path.basename(filePath);
        const newFileName = `${Date.now()}_${baseName}`;
        const destination = path.join(duplicatesPath, newFileName);

        this.logger.warn(
          `Duplicate file found (Hash: ${hex}). Recording in DB and moving to duplicates folder.`,
        );

        // Crear registro en la DB como DUPLICADO
        await this.documentRepository.create({
          fileName: newFileName,
          md5Hash: hex,
          state: DocumentState.DUPLICADO,
        });

        try {
          await fs.promises.rename(filePath, destination);
        } catch (err) {
          await fs.promises.copyFile(filePath, destination);
          await fs.promises.unlink(filePath);
        }
        return;
      }

      // Insert new Document
      const newDoc = await this.documentRepository.create({
        fileName: fileName,
        md5Hash: hex,
        state: DocumentState.EN_COLA_OCR,
      });

      this.logger.log(
        `Document created: ${newDoc.id}. Sending to queue cola_ocr.`,
      );

      // Add to Queue
      await this.ocrQueue.add(
        'process-ocr',
        {
          documentId: newDoc.id,
          filePath: filePath, // Should we leave it in TMP_IN? Yes, until OCR moves it.
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 20000, // 20s delay on retry (Wait, requirement says "2 reintentos y delay de 20s" - usually means fixed delay or specific backoff)
          },
        },
      );
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to process file ${fileName}: ${errMsg}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldFiles() {
    this.logger.log('Starting daily cleanup of old files...');
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
      ? [
          this.inPath,
          this.ocrPath,
          this.configService.get<string>('DONE_PATH', './local/done'),
        ]
      : [this.configService.get<string>('DONE_PATH', './local/done')];

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

  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }
}
