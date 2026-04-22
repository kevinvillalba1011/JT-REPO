import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSourceStrategy } from './client-source.strategy';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LocalClientStrategy implements ClientSourceStrategy {
  private readonly logger = new Logger(LocalClientStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchClients(): Promise<string[]> {
    let clientsPath = this.configService.get<string>(
      'LOCAL_CLIENTS_PATH',
      './local/data',
    );
    const clientsFileName = this.configService.get<string>(
      'CSV_CLIENTS_FILE',
      'clients.csv',
    );

    // In Docker, the volume mapped is a directory. If someone maps the directory,
    // we append the dynamic CSV filename to avoid EISDIR read error.
    if (!clientsPath.endsWith('.csv')) {
      clientsPath = path.join(clientsPath, clientsFileName);
    }

    if (!fs.existsSync(clientsPath)) {
      this.logger.warn(`Clients CSV file not found at ${clientsPath}`);
      return [];
    }

    try {
      const content = fs.readFileSync(clientsPath, 'utf8');
      // Simple CSV parsing: assume one ID per line or comma separated ID column
      return content
        .split(/\r?\n/)
        .map((line) => line.split(',')[0].trim()) // Taking first column as ID
        .filter((id) => id.length > 0);
    } catch (err) {
      this.logger.error(`Error reading clients CSV: ${err.message}`);
      return [];
    }
  }
}
