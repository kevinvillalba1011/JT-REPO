import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { Document, DocumentState } from '@prisma/client';
import { LocalReportStrategy } from './strategies/local-report.strategy';
import { FtpReportStrategy } from './strategies/ftp-report.strategy';
import { GmailReportStrategy } from './strategies/gmail-report.strategy';
import { ClientService } from '../client/client.service';
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
      const json = doc.json_modelo as any;
      const demandadoId = json?.demandado?.identificacion || json?.identificacion_demandado;
      
      const isClient = demandadoId ? this.clientService.isClient(demandadoId) : false;

      if (isClient) {
        reportLines.push(this.generate34Fields(doc));
      } else {
        reportLines.push(this.generate7Fields(doc));
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

  private generate7Fields(doc: Document): string {
    return [
      doc.id,
      doc.nombre_archivo,
      doc.estado,
      doc.createdAt.toISOString(),
      doc.updatedAt.toISOString(),
      doc.hash_md5,
      "NON_CLIENT"
    ].join(',');
  }

  private generate34Fields(doc: Document): string {
    const json = doc.json_modelo as any;
    const base = [
      doc.id,
      doc.nombre_archivo,
      doc.estado,
      doc.createdAt.toISOString(),
      doc.updatedAt.toISOString(),
      doc.hash_md5,
      json?.demandado?.identificacion || 'N/A',
      json?.demandado?.nombre || 'N/A'
    ];
    
    const fillers = new Array(26).fill('DATA');
    return [...base, ...fillers].join(',');
  }
}
