import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsModule } from './modules/documents/documents.module';
import { ExtractionModule } from './modules/extraction/extraction.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { ModelModule } from './modules/model/model.module';
import { ReportModule } from './modules/report/report.module';
import { ClientModule } from './modules/client/client.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { TestModule } from './modules/test/test.module';
import { FolderInitializerService } from './common/services/folder-initializer.service';
import { DailySequenceModule } from './common/services/daily-sequence.module';
import { NombreOficioFinalModule } from './common/services/nombre-oficio-final.module';
import { EntryReportModule } from './modules/entry-report/entry-report.module';

import { validate } from './common/config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    DocumentsModule,
    ExtractionModule,
    OcrModule,
    ModelModule,
    ReportModule,
    ClientModule,
    TenantModule,
    IntegrationModule,
    DailySequenceModule,
    NombreOficioFinalModule,
    EntryReportModule,
    TestModule,
  ],
  providers: [FolderInitializerService],
})
export class AppModule {}
