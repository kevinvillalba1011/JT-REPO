import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReportStrategy } from './report.strategy';
import { Client } from 'basic-ftp';
import * as path from 'path';
import * as fs from 'fs';
import { Readable } from 'stream';

@Injectable()
export class FtpReportStrategy implements ReportStrategy {
  private readonly logger = new Logger(FtpReportStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  async saveReport(fileName: string, content: string): Promise<void> {
    const host = this.configService.get<string>('FTP_HOST');
    const user = this.configService.get<string>('FTP_USER');
    const password = this.configService.get<string>('FTP_PASSWORD');
    const port = this.configService.get<number>('FTP_PORT', 21);
    const remotePath = this.configService.get<string>('FTP_REMOTE_PATH', '/');

    const client = new Client();
    try {
      await client.access({ host, user, password, port, secure: false });

      const remoteFilePath = path
        .join(remotePath, 'reports', fileName)
        .replace(/\\/g, '/');

      // Ensure directory exists
      const remoteDir = path.dirname(remoteFilePath);
      await client.ensureDir(remoteDir);

      const stream = Readable.from([content]);
      await client.uploadFrom(stream, path.basename(remoteFilePath));

      this.logger.log(`Report uploaded to FTP at ${remoteFilePath}`);
    } catch (err) {
      this.logger.error(`Error uploading report to FTP: ${err.message}`);
    } finally {
      client.close();
    }
  }
}
