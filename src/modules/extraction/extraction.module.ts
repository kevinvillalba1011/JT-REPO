import { Module } from '@nestjs/common';
import { ExtractionService } from './extraction.service';
import { LocalFileStrategy } from './strategies/local-file.strategy';
import { DocumentsModule } from '../documents/documents.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    DocumentsModule,
    BullModule.registerQueue(
      { name: 'cola_ocr' },
      { name: 'cola_modelo' },
      { name: 'cola_masivos' },
    ),
  ],
  providers: [ExtractionService, LocalFileStrategy],
  exports: [ExtractionService],
})
export class ExtractionModule {}
