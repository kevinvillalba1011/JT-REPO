import { Module } from '@nestjs/common';
import { OcrProcessor } from './ocr.processor';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigModule } from '@nestjs/config';
import { DocumentAiStrategy } from './strategies/document-ai.strategy';
import { ExcelExtractorStrategy } from './strategies/excel-extractor.strategy';

@Module({
  imports: [
    DocumentsModule,
    ConfigModule,
    BullModule.registerQueue({
      name: 'cola_modelo', // We are producing to this queue
    }),
    /* cola_ocr is consumed here, so we don't register it for production 
       unless we retry ourselves (which we don't, Bull does). 
       But Processor decorator handles worker creation. 
       Usually we don't need registerQueue('cola_ocr') here unless flow requires it. 
       Wait, NestJS BullMQ documentation says Processor classes are automatically picked up if Queue is registered or global config is present?
       Actually, for Workers we just need to provide the Processor class. 
       However, the *Queue* itself might need to be registered in some module so BullMQ sets it up?
       Usually `BullModule.registerQueue({ name: 'cola_ocr' })` is needed somewhere. 
       It is registered in ExtractionModule (producer).
       Here we consume it. The @Processor decorator handles the consumption.
       We don't strictly need registerQueue('cola_ocr') here.
    */
  ],
  providers: [OcrProcessor, DocumentAiStrategy, ExcelExtractorStrategy],
})
export class OcrModule {}
