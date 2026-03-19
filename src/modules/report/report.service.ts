import { Injectable, Logger, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { Document, DocumentState } from '@prisma/client';
import { LocalReportStrategy } from './strategies/local-report.strategy';
import { FtpReportStrategy } from './strategies/ftp-report.strategy';
import { GmailReportStrategy } from './strategies/gmail-report.strategy';
import { ClientService } from '../client/client.service';
import type { TenantProfile } from '../tenant/interfaces/tenant-profile.interface';
import * as fs from 'fs';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly documentRepository: DocumentRepository,
    private readonly localStrategy: LocalReportStrategy,
    private readonly ftpStrategy: FtpReportStrategy,
    private readonly gmailStrategy: GmailReportStrategy,
    private readonly clientService: ClientService,
    @Inject('TENANT_PROFILE') private readonly profile: TenantProfile,
  ) {}

  @Cron(process.env.CRON_REPORT_SCHEDULE || '0 23 * * *')
  async handleReport() {
    this.logger.log('Starting Report Generation...');
    
    // Get IA_OK documents
    const docs = await this.documentRepository.findByState(DocumentState.IA_OK);
    this.logger.log(`Found ${docs.length} documents to report.`);

    if (docs.length === 0) return;

    // Generate content
    const reportLines: string[] = [];
    
    for (const doc of docs) {
      const json = doc.jsonModel as any;
      const demandadoId = json ? json[this.profile.identifierKey] : null;
      
      const isClient = demandadoId ? this.clientService.isClient(demandadoId) : false;

      if (isClient) {
        reportLines.push(this.generateDynamicFields(doc, this.profile.clientFields));
      } else {
        reportLines.push(this.generateDynamicFields(doc, this.profile.nonClientFields));
      }
    }

    // Prepare File Name
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}${month}${year}`;
    const fileName = `${dateStr}/reporte.csv`;

    // Select Strategy
    const mode = this.configService.get<string>('GLOBAL_MODE', 'LOCAL');
    let strategy;
    if (mode === 'FTP') {
      strategy = this.ftpStrategy;
    } else if (mode === 'GMAIL') {
      strategy = this.gmailStrategy;
    } else {
      strategy = this.localStrategy;
    }

    await strategy.saveReport(fileName, reportLines.join('\n'));
    this.logger.log(`Report generation completed using ${mode} mode.`);
  }

  private generateDynamicFields(doc: Document, fieldsArray: string[]): string {
    const json = doc.jsonModel as any || {};
    
    // Default base columns for every exported document (system data)
    const baseColumns = [
      doc.id,
      doc.fileName,
      doc.state,
      doc.createdAt.toISOString(),
      doc.updatedAt.toISOString(),
      doc.md5Hash
    ];

    // Dynamic columns from structured JSON model based on schema
    const dynamicColumns = fieldsArray.map(field => {
      const value = json[field];
      if (value === undefined || value === null) return 'N/A';
      
      // If the field is an array (like multi-selection items), join them
      if (Array.isArray(value)) return `"${value.join(' | ')}"`;
      
      // Wrap strings in quotes if they contain commas to avoid CSV breakage
      if (typeof value === 'string' && value.includes(',')) return `"${value}"`;
      
      return value;
    });

    return [...baseColumns, ...dynamicColumns].join(',');
  }
}
