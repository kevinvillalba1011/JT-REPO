import { Module } from '@nestjs/common';
import { ModelProcessor } from './model.processor';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigModule } from '@nestjs/config';
import { GeminiService } from '../../common/services/gemini.service';
import { DocumentAiStrategy } from '../ocr/strategies/document-ai.strategy';

@Module({
  imports: [DocumentsModule, ConfigModule],
  // DocumentAiStrategy se provee aquí como FALLBACK de OCR cuando el envío
  // multimodal del PDF a Gemini falla o el archivo supera el límite inline.
  providers: [ModelProcessor, GeminiService, DocumentAiStrategy],
})
export class ModelModule {}
