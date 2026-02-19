import { Module } from '@nestjs/common';
import { ModelProcessor } from './model.processor';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [DocumentsModule, ConfigModule],
  providers: [ModelProcessor],
})
export class ModelModule {}
