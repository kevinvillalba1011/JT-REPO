import { Injectable } from '@nestjs/common';
import { ClientSourceStrategy } from './client-source.strategy';

@Injectable()
export class GmailClientStrategy implements ClientSourceStrategy {
  async fetchClients(): Promise<string[]> {
    // User: "gmail: No aplica de momento, a cualquier consulta devuelve true"
    // I will return a special token or just empty, but the Service will handle the "always true" logic
    return ['GMAIL_MODE_ALWAYS_TRUE'];
  }
}
