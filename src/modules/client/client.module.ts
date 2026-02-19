import { Module, Global } from '@nestjs/common';
import { ClientService } from './client.service';
import { LocalClientStrategy } from './strategies/local-client.strategy';
import { FtpClientStrategy } from './strategies/ftp-client.strategy';
import { GmailClientStrategy } from './strategies/gmail-client.strategy';

@Global()
@Module({
  providers: [
    ClientService,
    LocalClientStrategy,
    FtpClientStrategy,
    GmailClientStrategy,
  ],
  exports: [ClientService],
})
export class ClientModule {}
