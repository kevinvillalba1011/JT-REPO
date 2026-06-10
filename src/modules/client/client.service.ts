import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LocalClientStrategy } from './strategies/local-client.strategy';

@Injectable()
export class ClientService implements OnModuleInit {
  private readonly logger = new Logger(ClientService.name);
  private clientIds: Set<string> = new Set();

  constructor(private readonly localStrategy: LocalClientStrategy) {}

  async onModuleInit() {
    await this.refreshClientList();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async refreshClientList() {
    const ids = await this.localStrategy.fetchClients();
    this.clientIds = new Set(ids);
    this.logger.log(`Loaded ${this.clientIds.size} client IDs.`);
  }

  isClient(identification: any): boolean {
    if (!identification) return false;

    // Normalize identification (remove dots,- etc) handling raw numbers and nested objects
    let idString = '';
    if (typeof identification === 'string') {
      idString = identification;
    } else if (typeof identification === 'number') {
      idString = identification.toString();
    } else if (Array.isArray(identification) && identification.length > 0) {
      // Si el profile arroja un Array (ej. BBVA demandados), intentamos cazar dinámicamente un ID adentro
      idString = String(
        identification[0].identificacion ||
          identification[0].no_id_demandado ||
          '',
      );
    } else {
      idString = String(identification);
    }

    const normalized = idString.replace(/\D/g, '');
    return (
      this.clientIds.has(normalized) || this.clientIds.has(idString.trim())
    );
  }
}
