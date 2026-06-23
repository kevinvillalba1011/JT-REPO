import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TestController } from './test.controller';
import { GeminiService } from '../../common/services/gemini.service';

/**
 * Módulo de PRUEBA (no productivo) para evaluar el enfoque "PDF directo a
 * Gemini" sin Document AI. GeminiService depende de ConfigService (global) y de
 * 'TENANT_PROFILE' (provisto globalmente por TenantModule).
 */
@Module({
  imports: [ConfigModule],
  controllers: [TestController],
  providers: [GeminiService],
})
export class TestModule {}
