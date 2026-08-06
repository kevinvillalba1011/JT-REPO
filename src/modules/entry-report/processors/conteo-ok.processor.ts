import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { EntryReportService, ConteoJobData } from '../entry-report.service';

/**
 * Consume `cola_conteo_ok` (documentos que llegaron a IA_OK / EXCEL_OK) e
 * incrementa `numeroDocumentosProcesados` en el EntryReport correspondiente.
 *
 * `concurrency: 1` es deliberado: aunque `registrarConteoIdempotente` ya es
 * seguro ante ejecuciones concurrentes (usa una transacción con
 * `updateMany` condicionado), serializar los incrementos evita contención
 * innecesaria sobre la misma fila de EntryReport cuando llegan varios
 * documentos del mismo lote casi al mismo tiempo — el volumen de esta cola
 * es bajo (un mensaje por documento terminado) así que no hay costo real en
 * rendimiento.
 */
@Injectable()
@Processor('cola_conteo_ok', { concurrency: 1 })
export class ConteoOkProcessor extends WorkerHost {
  private readonly logger = new Logger(ConteoOkProcessor.name);

  constructor(private readonly entryReportService: EntryReportService) {
    super();
  }

  async process(job: Job<ConteoJobData>): Promise<void> {
    await this.entryReportService.registrarConteo(job.data);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: any) {
    this.logger.error(
      `Job ${job.id} (Document ${job.data?.documentId}) falló registrando conteo OK: ${err.message}`,
    );
  }
}
