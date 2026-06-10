import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { Document, DocumentState } from '@prisma/client';
import { LocalReportStrategy } from './strategies/local-report.strategy';
import { ClientService } from '../client/client.service';
import type { TenantProfile } from '../tenant/interfaces/tenant-profile.interface';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly localStrategy: LocalReportStrategy,
    private readonly clientService: ClientService,
    @Inject('TENANT_PROFILE') private readonly profile: TenantProfile,
  ) {}

  @Cron(process.env.CRON_REPORT_SCHEDULE || '0 23 * * *')
  async handleReport() {
    this.logger.log('Starting Report Generation...');

    const docs = await this.documentRepository.findByState(DocumentState.IA_OK);
    this.logger.log(`Found ${docs.length} documents to report.`);

    if (docs.length === 0) return;

    const reportLines: string[] = [];

    for (const doc of docs) {
      const json = doc.jsonModel as Record<string, unknown> | null;
      if (!json) continue;

      const demandados = (json.demandados as any[]) || [];
      if (demandados.length === 0) {
        // Fallback: single row without demandado expansion
        const isClient = this.checkIsClient(json);
        reportLines.push(
          this.generateDynamicFields(doc, json, this.profile.clientFields),
        );
        continue;
      }

      // One CSV row per demandado
      for (const demandado of demandados) {
        const demandadoJson = { ...json, demandados: [demandado] };
        const isClient = this.checkIsClient(demandadoJson);
        reportLines.push(
          this.generateDynamicFields(
            doc,
            demandadoJson,
            isClient ? this.profile.clientFields : this.profile.nonClientFields,
          ),
        );
      }
    }

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}${month}${year}`;
    const fileName = `${dateStr}/reporte.csv`;

    await this.localStrategy.saveReport(fileName, reportLines.join('\n'));
    this.logger.log('Report generation completed.');
  }

  private checkIsClient(json: Record<string, unknown>): boolean {
    const demandadoId = this.resolvePath(json, this.profile.identifierKey);
    return demandadoId
      ? this.clientService.isClient(String(demandadoId))
      : false;
  }

  private resolvePath(
    obj: Record<string, unknown> | null,
    path: string,
  ): unknown {
    if (!obj || !path) return undefined;
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (
        current === null ||
        current === undefined ||
        typeof current !== 'object'
      )
        return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private generateDynamicFields(
    doc: Document,
    json: Record<string, unknown>,
    fieldsArray: string[],
  ): string {
    const baseColumns = [
      doc.id,
      doc.fileName,
      doc.state,
      doc.createdAt.toISOString(),
      doc.updatedAt.toISOString(),
      doc.md5Hash,
    ];

    const dynamicColumns = fieldsArray.map((field) => {
      const value = this.resolvePath(json, field);
      if (value === undefined || value === null) return 'N/A';

      if (Array.isArray(value))
        return `"${value.map((v) => String(v)).join(' | ')}"`;

      if (typeof value === 'string' && value.includes(',')) return `"${value}"`;

      return value;
    });

    return [...baseColumns, ...dynamicColumns].join(',');
  }
}
