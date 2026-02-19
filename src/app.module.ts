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
import { FolderInitializerService } from './common/services/folder-initializer.service';

@Module({
  imports: [
    ConfigModule.forRoot({
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
  ],
  providers: [FolderInitializerService],
})
export class AppModule {}
