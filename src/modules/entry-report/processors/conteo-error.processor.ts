import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { EntryReportService, ConteoJobData } from '../entry-report.service';

/**
 * Consume `cola_conteo_error` (documentos que llegaron a MODEL_ERROR /
 * ERROR_OCR de forma definitiva) e incrementa `numeroDocumentosError` en el
 * EntryReport correspondiente.
 *
 * `concurrency: 1` por el mismo motivo que `ConteoOkProcessor`: serializa
 * los incrementos sobre la misma fila de EntryReport, evitando contención
 * cuando varios documentos del mismo lote fallan casi al mismo tiempo.
 */
@Injectable()
@Processor('cola_conteo_error', { concurrency: 1 })
export class ConteoErrorProcessor extends WorkerHost {
  private readonly logger = new Logger(ConteoErrorProcessor.name);

  constructor(private readonly entryReportService: EntryReportService) {
    super();
  }

  async process(job: Job<ConteoJobData>): Promise<void> {
    await this.entryReportService.registrarConteo(job.data);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: any) {
    this.logger.error(
      `Job ${job.id} (Document ${job.data?.documentId}) falló registrando conteo de error: ${err.message}`,
    );
  }
}
