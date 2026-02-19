import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSourceStrategy } from './client-source.strategy';
import { Client } from 'basic-ftp';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FtpClientStrategy implements ClientSourceStrategy {
  private readonly logger = new Logger(FtpClientStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchClients(): Promise<string[]> {
    const host = this.configService.get<string>('FTP_HOST');
    const user = this.configService.get<string>('FTP_USER');
    const password = this.configService.get<string>('FTP_PASSWORD');
    const port = this.configService.get<number>('FTP_PORT', 21);
    
    // Remote path structure suggested by user: FTP_REMOTE_PATH/CLIENTS_PATH/CLIENTS_FILE
    const remotePath = this.configService.get<string>('FTP_REMOTE_PATH', '/');
    const clientsFile = this.configService.get<string>('CSV_CLIENTS_FILE', 'clients.csv');
    
    const client = new Client();
    try {
      await client.access({ host, user, password, port, secure: false });
      
      const tempPath = path.join(process.cwd(), 'tmp', 'clients_download.csv');
      await client.downloadTo(tempPath, path.join(remotePath, clientsFile));
      
      const content = fs.readFileSync(tempPath, 'utf8');
      fs.unlinkSync(tempPath);

      return content
        .split(/\r?\n/)
        .map(line => line.split(',')[0].trim())
        .filter(id => id.length > 0);
    } catch (err) {
      this.logger.error(`Error fetching clients via FTP: ${err.message}`);
      return [];
    } finally {
      client.close();
    }
  }
}
