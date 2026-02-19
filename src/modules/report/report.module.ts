import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigModule } from '@nestjs/config';
import { LocalReportStrategy } from './strategies/local-report.strategy';
import { FtpReportStrategy } from './strategies/ftp-report.strategy';
import { GmailReportStrategy } from './strategies/gmail-report.strategy';

@Module({
  imports: [DocumentsModule, ConfigModule],
  providers: [
    ReportService,
    LocalReportStrategy,
    FtpReportStrategy,
    GmailReportStrategy
  ],
})
export class ReportModule {}
