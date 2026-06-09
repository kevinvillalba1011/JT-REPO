import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { DocumentState } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { GeminiService } from '../../common/services/gemini.service';
import { ClientService } from '../client/client.service';
import type { TenantProfile } from '../tenant/interfaces/tenant-profile.interface';
import { IntegrationService } from '../integration/integration.service';

@Injectable()
@Processor('cola_modelo', {
  concurrency: parseInt(process.env.MODEL_QUEUE_CONCURRENCY || '2', 10),
  limiter: {
    max: parseInt(process.env.MODEL_QUEUE_RPM_LIMIT || '15', 10),
    duration: 60000,
  },
  lockDuration: 300000, // 5 minutes to bypass WSL/Docker clock drift
})
export class ModelProcessor extends WorkerHost {
  private readonly logger = new Logger(ModelProcessor.name);
  private readonly donePath: string;

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly configService: ConfigService,
    private readonly clientService: ClientService,
    private readonly geminiService: GeminiService,
    private readonly integrationService: IntegrationService,
    @Inject('TENANT_PROFILE') private readonly profile: TenantProfile,
  ) {
    super();
    this.donePath = path.resolve(
      process.cwd(),
      this.configService.get<string>('DONE_PATH', './local/done'),
    );
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { documentId, filePath, text, originalPath } = job.data;
    this.logger.log(
      `Processing Model Job ${job.id} for Document ${documentId}`,
    );

    // Update State: PROCESANDO_MODELO
    await this.documentRepository.updateState(
      documentId,
      DocumentState.PROCESANDO_MODELO,
    );

    // Check if key is valid (simple check)
    if (!this.configService.get<string>('GEMINI_API_KEY')) {
      throw new Error('Missing GEMINI_API_KEY environment variable.');
    }

    try {
      let resultJson: Record<string, unknown>;

      try {
        if (
          text &&
          (text.includes('[WORD_FILE_DIRECT_PROCESSING]') ||
            text.includes('[CONVERTED_PDF_PROCESSING]'))
        ) {
          throw new Error(
            'Este es un trabajo antiguo de Word que ya no es compatible. El archivo se ha movido a la carpeta de no admitidos.',
          );
        }
        resultJson = await this.geminiService.extraerJudicial(text);

        // Lógica temporalmente deshabilitada por petición del usuario para guardar el JSON puro
        /*
        const demandadoId = resultJson[this.profile.identifierKey];
        if (demandadoId) {
          const isClient = this.clientService.isClient(demandadoId);
          if (!isClient) {
            this.logger.warn(
              `Ninguno de los implicados (${JSON.stringify(demandadoId)}) es un cliente. Recortando JSON por seguridad (Trimming) a ${this.profile.nonClientFields.length} campos.`,
            );
            const trimmedJson = {};
            this.profile.nonClientFields.forEach((k) => {
              if (resultJson[k] !== undefined) trimmedJson[k] = resultJson[k];
            });
            resultJson = trimmedJson;
          }
        }
        */
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Gemini API Error: ${errMsg}`);
        throw err;
      }

      // Success
      this.logger.log(
        `Model Success. Result keys: ${Object.keys(resultJson).join(', ')}`,
      );

      const fileName = path.basename(filePath);
      const doneFilePath = path.join(this.donePath, fileName);

      // Move file
      try {
        await fs.promises.rename(filePath, doneFilePath);
      } catch (err) {
        await fs.promises.copyFile(filePath, doneFilePath);
        await fs.promises.unlink(filePath);
      }

      // Inyectar fechas manualmente en formato ISO 8601
      const nowIso = new Date().toISOString();
      const now = new Date();

      if (!resultJson.oficio || typeof resultJson.oficio !== 'object') {
        resultJson.oficio = {};
      }
      (resultJson.oficio as Record<string, unknown>).rutaPdf =
        originalPath || filePath;
      (
        resultJson.oficio as Record<string, unknown>
      ).fechaHoraProcesamientoOficio = nowIso;

      // Post-procesar nombreArchivo: reemplazar placeholder con fecha proceso + consecutivo
      const nombreArchivo = (resultJson.oficio as Record<string, unknown>)
        .nombreArchivo;
      if (typeof nombreArchivo === 'string' && nombreArchivo.includes('00000000')) {
        const mmdd = String(now.getMonth() + 1).padStart(2, '0') +
          String(now.getDate()).padStart(2, '0');

        const docsToday = await this.documentRepository.countProcessedToday();
        const consecutivo = String(docsToday + 1).padStart(4, '0');

        (resultJson.oficio as Record<string, unknown>).nombreArchivo =
          nombreArchivo.replace('00000000', `${mmdd}${consecutivo}`);
      }

      if (
        !resultJson.infoCliente ||
        typeof resultJson.infoCliente !== 'object'
      ) {
        resultJson.infoCliente = {};
      }
      (
        resultJson.infoCliente as Record<string, unknown>
      ).fechaHoraRecepcionCorreo = nowIso;

      // Update DB
      await this.documentRepository.updateState(
        documentId,
        DocumentState.IA_OK,
        {
          jsonModel: resultJson as any,
        },
      );

      // Integrate with external REST service
      await this.integrationService.sendData(resultJson, 'IA_OK');
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Model Processing Failed for Document ${documentId}: ${errMsg}`,
        error instanceof Error ? error.stack : '',
      );

      // Update state to MODEL_ERROR before re-throwing for BullMQ retries
      await this.documentRepository.updateState(
        documentId,
        DocumentState.MODEL_ERROR,
        {
          jsonModel: {
            error: errMsg,
            timestamp: new Date().toISOString(),
          },
        },
      );

      // Re-throw to allow BullMQ to handle retries
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} has completed!`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: any) {
    const { documentId } = job.data;
    this.logger.error(
      `Job ${job.id} (Document ${documentId}) has failed permanently with ${err.message}`,
    );

    // Update document state to MODEL_ERROR when all retries are exhausted
    try {
      await this.documentRepository.updateState(
        documentId,
        DocumentState.MODEL_ERROR,
        {
          jsonModel: {
            error: err.message,
            errorType: 'permanent_failure',
            timestamp: new Date().toISOString(),
            attempts: job.attemptsMade,
          },
        },
      );
      this.logger.log(
        `Document ${documentId} marked as MODEL_ERROR in database`,
      );
    } catch (dbError: any) {
      const dbErrMsg =
        dbError instanceof Error ? dbError.message : String(dbError);
      this.logger.error(`Failed to update document state: ${dbErrMsg}`);
    }
  }
}
