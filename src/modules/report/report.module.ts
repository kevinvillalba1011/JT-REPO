import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigModule } from '@nestjs/config';
import { LocalReportStrategy } from './strategies/local-report.strategy';

@Module({
  imports: [DocumentsModule, ConfigModule],
  providers: [ReportService, LocalReportStrategy],
})
export class ReportModule {}
