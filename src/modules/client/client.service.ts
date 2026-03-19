import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LocalClientStrategy } from './strategies/local-client.strategy';
import { FtpClientStrategy } from './strategies/ftp-client.strategy';
import { GmailClientStrategy } from './strategies/gmail-client.strategy';

@Injectable()
export class ClientService implements OnModuleInit {
  private readonly logger = new Logger(ClientService.name);
  private clientIds: Set<string> = new Set();
  private isGmailMode = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly localStrategy: LocalClientStrategy,
    private readonly ftpStrategy: FtpClientStrategy,
    private readonly gmailStrategy: GmailClientStrategy,
  ) {}

  async onModuleInit() {
    await this.refreshClientList();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async refreshClientList() {
    const mode = this.configService.get<string>('GLOBAL_MODE', 'LOCAL');
    this.logger.log(`Loading clients using mode: ${mode}`);

    let strategy;
    if (mode === 'FTP') {
      strategy = this.ftpStrategy;
    } else if (mode === 'GMAIL') {
      strategy = this.gmailStrategy;
    } else {
      strategy = this.localStrategy;
    }

    const ids = await strategy.fetchClients();
    
    if (ids.includes('GMAIL_MODE_ALWAYS_TRUE')) {
      this.isGmailMode = true;
      this.clientIds = new Set();
    } else {
      this.isGmailMode = false;
      this.clientIds = new Set(ids);
    }
    
    this.logger.log(`Loaded ${this.clientIds.size} client IDs.`);
  }

  isClient(identification: any): boolean {
    if (this.isGmailMode) return true;
    if (!identification) return false;
    
    // Normalize identification (remove dots,- etc) handling raw numbers and nested objects
    let idString = '';
    if (typeof identification === 'string') {
      idString = identification;
    } else if (typeof identification === 'number') {
      idString = identification.toString();
    } else if (Array.isArray(identification) && identification.length > 0) {
      // Si el profile arroja un Array (ej. BBVA demandados), intentamos cazar dinámicamente un ID adentro
      idString = String(identification[0].identificacion || identification[0].no_id_demandado || '');
    } else {
      idString = String(identification);
    }

    const normalized = idString.replace(/\D/g, '');
    return this.clientIds.has(normalized) || this.clientIds.has(idString.trim());
  }
}
