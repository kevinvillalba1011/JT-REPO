import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IntegrationService } from './integration.service';

@Global() // Made global so it's easy to use in processors
@Module({
  imports: [ConfigModule],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class IntegrationModule {}
