import { Module, Global } from '@nestjs/common';
import { ClientService } from './client.service';
import { LocalClientStrategy } from './strategies/local-client.strategy';

@Global()
@Module({
  providers: [ClientService, LocalClientStrategy],
  exports: [ClientService],
})
export class ClientModule {}
