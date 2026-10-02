import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExtractionManualController } from './extraction-manual.controller';
import { GeminiService } from '../../common/services/gemini.service';

/**
 * Endpoint productivo (no de prueba, a diferencia de TestModule) de
 * extraccion sincrona a demanda, usado por el boton "Rellenar datos" del
 * portal B2B legado. GeminiService depende de ConfigService (global) y de
 * 'TENANT_PROFILE' (provisto globalmente por TenantModule). Ver
 * .agents/decisions.md.
 */
@Module({
  imports: [ConfigModule],
  controllers: [ExtractionManualController],
  providers: [GeminiService],
})
export class ExtractionManualModule {}
