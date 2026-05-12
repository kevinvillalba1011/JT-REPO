import {
  FileExtractorStrategy,
  ExtractedFile,
} from './file-extractor.strategy';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GmailFileStrategy implements FileExtractorStrategy {
  private readonly logger = new Logger(GmailFileStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  async extractFiles(destinationFolder: string): Promise<ExtractedFile[]> {
    const user = this.configService.get<string>('GMAIL_USER');
    const pass = this.configService.get<string>('GMAIL_APP_PASSWORD');
    const host = this.configService.get<string>(
      'GMAIL_IMAP_HOST',
      'imap.gmail.com',
    );
    const port = this.configService.get<number>('GMAIL_IMAP_PORT', 993);
    const searchSubject = this.configService.get<string>(
      'GMAIL_SEARCH_SUBJECT',
      'DOCUMENTO_PROCESAR',
    );

    if (!user || !pass) {
      this.logger.warn(
        'Gmail credentials not configured. Skipping extraction.',
      );
      return [];
    }

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: {
        user,
        pass,
      },
      logger: false, // disable internal logger for cleaner output
    });

    const extractedFiles: ExtractedFile[] = [];

    try {
      await client.connect();
      this.logger.log('Connected to Gmail IMAP');

      const lock = await client.getMailboxLock('INBOX');
      try {
        // Search for UNSEEN messages with specific subject
        // ImapFlow search query syntax
        // search returns an iterator
        const searchCriteria: any = {
          unseen: true,
          header: { subject: searchSubject },
        };
        const messages = await client.search(searchCriteria);

        if (messages === false) {
          this.logger.debug('Search command failed or returned false');
          return [];
        }

        const allowedExtensions = this.configService
          .get<string>('ALLOWED_EXTENSIONS', '')
          .split(',')
          .map((ext) => ext.trim().toLowerCase());

        for (const seq of messages) {
          this.logger.log(`Processing email seq: ${seq}`);

          // Note: Real implementation should parse mime to get original attachment extension
          // For this simulation, we use a name and check it against allowed
          const filename = `email_${Date.now()}.pdf`;
          const ext = path.extname(filename).toLowerCase();

          if (
            allowedExtensions.length > 0 &&
            !allowedExtensions.includes(ext)
          ) {
            this.logger.debug(
              `Skipping Gmail attachment ${filename}: Extension ${ext} not allowed.`,
            );
            continue;
          }

          const filePath = path.join(destinationFolder, filename);
          fs.writeFileSync(filePath, 'Contenido simulado del adjunto');

          extractedFiles.push({
            name: filename,
            originalPath: `email-seq-${seq}`,
            destinationPath: filePath,
          });

          // Mark as seen
          await client.messageFlagsAdd(seq, ['\\Seen']);
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err) {
      this.logger.error(`Error in Gmail extraction: ${err.message}`);
    }

    return extractedFiles;
  }
}
