import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSourceStrategy } from './client-source.strategy';
import * as fs from 'fs';

@Injectable()
export class LocalClientStrategy implements ClientSourceStrategy {
  private readonly logger = new Logger(LocalClientStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchClients(): Promise<string[]> {
    const clientsPath = this.configService.get<string>('LOCAL_DATA_PATH', './local/data/clients.csv');
    if (!fs.existsSync(clientsPath)) {
      this.logger.warn(`Clients CSV file not found at ${clientsPath}`);
      return [];
    }

    try {
      const content = fs.readFileSync(clientsPath, 'utf8');
      // Simple CSV parsing: assume one ID per line or comma separated ID column
      return content
        .split(/\r?\n/)
        .map(line => line.split(',')[0].trim()) // Taking first column as ID
        .filter(id => id.length > 0);
    } catch (err) {
      this.logger.error(`Error reading clients CSV: ${err.message}`);
      return [];
    }
  }
}
