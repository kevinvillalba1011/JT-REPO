import { Module } from '@nestjs/common';
import { ModelProcessor } from './model.processor';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigModule } from '@nestjs/config';
import { GeminiService } from '../../common/services/gemini.service';

@Module({
  imports: [DocumentsModule, ConfigModule],
  providers: [ModelProcessor, GeminiService],
})
export class ModelModule {}
