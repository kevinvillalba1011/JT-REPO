import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { DocumentState, IntegrationStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { GeminiService } from '../../common/services/gemini.service';
import { ClientService } from '../client/client.service';
import type { TenantProfile } from '../tenant/interfaces/tenant-profile.interface';
import { IntegrationService } from '../integration/integration.service';
import { DailySequenceService } from '@/common/services/daily-sequence.service';
import { nowBogotaISOString, nowBogotaDate } from '@/common/utils/date.util';
import { isPermanentError } from '@/common/utils/error-classifier.util';
import { DocumentAiStrategy } from '../ocr/strategies/document-ai.strategy';

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
  private readonly ocrDestinationPath: string;
  private readonly unreadablePath: string;

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly configService: ConfigService,
    private readonly clientService: ClientService,
    private readonly geminiService: GeminiService,
    private readonly integrationService: IntegrationService,
    private readonly dailySequence: DailySequenceService,
    private readonly docAiStrategy: DocumentAiStrategy,
    @Inject('TENANT_PROFILE') private readonly profile: TenantProfile,
  ) {
    super();
    this.ocrDestinationPath = path.resolve(
      process.cwd(),
      this.configService.get<string>(
        'OCR_DESTINATION_PATH',
        './local/ocr-done',
      ),
    );
    this.unreadablePath = path.resolve(
      process.cwd(),
      this.configService.get<string>(
        'OCR_UNREADABLE_PATH',
        './local/ocr-unreadable',
      ),
    );
  }

  /**
   * Deriva el mimeType soportado por Gemini a partir de la extensión.
   * Devuelve null para extensiones no aptas para envío multimodal.
   */
  private resolveMimeType(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.pdf':
        return 'application/pdf';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.tiff':
      case '.tif':
        return 'image/tiff';
      default:
        return null;
    }
  }

  /**
   * Estrategia de extracción: envía el archivo DIRECTO a Gemini (multimodal).
   * Si el multimodal falla, o el archivo supera el límite inline configurado,
   * cae a Document AI (OCR) → Gemini sobre texto como FALLBACK. Si ninguno
   * extrae contenido, lanza error (documento ilegible → revisión).
   */
  private async extraerMultimodalConFallback(
    filePath: string,
  ): Promise<Record<string, unknown>> {
    const mimeType = this.resolveMimeType(filePath);
    const maxInlineMb = this.configService.get<number>(
      'GEMINI_INLINE_MAX_MB',
      15,
    );

    let demasiadoGrande = false;
    try {
      const stat = await fs.promises.stat(filePath);
      demasiadoGrande = stat.size > maxInlineMb * 1024 * 1024;
    } catch {
      // Si no se puede medir el tamaño, se intenta multimodal de todos modos.
    }

    if (mimeType && !demasiadoGrande) {
      try {
        const buffer = await fs.promises.readFile(filePath);
        this.logger.log(
          `Extracción MULTIMODAL (PDF directo a Gemini): ${path.basename(filePath)}`,
        );
        return (await this.geminiService.extraerJudicial(
          '(El contenido a procesar está en el documento adjunto.)',
          buffer,
          mimeType,
        )) as Record<string, unknown>;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Multimodal falló (${msg}). Fallback a Document AI (OCR).`,
        );
      }
    } else if (demasiadoGrande) {
      this.logger.warn(
        `Archivo supera ${maxInlineMb}MB para envío inline. Usando Document AI (OCR).`,
      );
    }

    // Fallback: Document AI (OCR) -> Gemini sobre texto
    const text = await this.docAiStrategy.extractText(filePath);
    if (!text.trim()) {
      throw new Error(
        'Documento ilegible: ni el envío multimodal ni Document AI (OCR) extrajeron contenido.',
      );
    }
    return (await this.geminiService.extraerJudicial(text)) as Record<
      string,
      unknown
    >;
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { documentId, filePath, text, originalPath } = job.data;
    this.logger.verbose(
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
        resultJson = await this.extraerMultimodalConFallback(filePath);

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

      // Inyectar fechas manualmente en formato ISO 8601, hora de Bogotá (UTC-5)
      const nowIso = nowBogotaISOString();

      if (!resultJson.oficio || typeof resultJson.oficio !== 'object') {
        resultJson.oficio = {};
      }
      const oficio = resultJson.oficio as Record<string, unknown>;
      oficio.fechaHoraProcesamientoOficio = nowIso;

      // Inyectar nombreOficioInicial desde el nombre del archivo original (trazabilidad)
      const nombreOficioInicial = path.basename(
        filePath,
        path.extname(filePath),
      );
      oficio.nombreOficioInicial = nombreOficioInicial;

      // Post-procesar nombreOficioFinal: reemplazar placeholder con fecha proceso + consecutivo.
      // Gemini puede devolver "00000000" o literalmente "MMDDconsecutivo4Digitos".
      const OFICIO_PLACEHOLDER = /00000000|MMDDconsecutivo4Digitos/;
      let nombreOficioFinal =
        typeof oficio.nombreOficioFinal === 'string'
          ? oficio.nombreOficioFinal
          : '';
      if (OFICIO_PLACEHOLDER.test(nombreOficioFinal)) {
        const { mmdd, consecutivo } = await this.dailySequence.getNext();
        nombreOficioFinal = nombreOficioFinal.replace(
          OFICIO_PLACEHOLDER,
          `${mmdd}${consecutivo}`,
        );
      }
      oficio.nombreOficioFinal = nombreOficioFinal;

      // Renombrar el archivo con nombreOficioFinal al moverlo a OCR_DESTINATION_PATH;
      // nombreOficioInicial conserva el nombre original para trazabilidad.
      const fileExt = path.extname(filePath);
      const sanitizedFinalName = nombreOficioFinal
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();
      const doneFileName =
        sanitizedFinalName && sanitizedFinalName !== '0'
          ? `${sanitizedFinalName}${fileExt}`
          : path.basename(filePath);
      const doneFilePath = path.join(this.ocrDestinationPath, doneFileName);

      // Move file
      try {
        await fs.promises.rename(filePath, doneFilePath);
      } catch {
        await fs.promises.copyFile(filePath, doneFilePath);
        await fs.promises.unlink(filePath);
      }

      // Remove the original source file so it doesn't remain duplicated
      // alongside the copy now living in OCR_DESTINATION_PATH
      if (originalPath && originalPath !== filePath) {
        try {
          await fs.promises.unlink(originalPath);
        } catch (err: any) {
          this.logger.warn(
            `Could not remove original source file ${originalPath}: ${err.message}`,
          );
        }
      }

      oficio.rutaPdf = doneFilePath;

      if (
        !resultJson.infoCliente ||
        typeof resultJson.infoCliente !== 'object'
      ) {
        resultJson.infoCliente = {};
      }
      (
        resultJson.infoCliente as Record<string, unknown>
      ).fechaHoraRecepcionCorreo = nowIso;

      // Update DB. Esto se guarda ANTES de intentar el envío externo: el
      // JSON extraído nunca debe perderse ni quedar pendiente de escribir
      // solo porque el envío al servicio externo tarde, falle o cuelgue.
      await this.documentRepository.updateState(
        documentId,
        DocumentState.IA_OK,
        {
          jsonModel: resultJson as any,
        },
      );

      // Integrate with external REST service. sendData() nunca lanza (atrapa
      // sus propios errores) y devuelve un boolean — antes se descartaba,
      // dejando sin rastro en BD si el JSON realmente llegó al sistema
      // externo. Se persiste el resultado en integrationStatus, un campo
      // dedicado separado del estado IA_OK (que sigue significando solo
      // "extracción exitosa").
      const integrationSent = await this.integrationService.sendData(
        resultJson,
        'IA_OK',
      );
      await this.documentRepository.updateState(
        documentId,
        DocumentState.IA_OK,
        {
          integrationStatus: integrationSent
            ? IntegrationStatus.ENVIADO
            : IntegrationStatus.FALLIDO,
          integrationSentAt: nowBogotaDate(),
          integrationError: integrationSent
            ? null
            : 'Fallo al enviar al servicio externo (ver logs de IntegrationService para detalle).',
        },
      );
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Model Processing Failed for Document ${documentId}: ${errMsg}`,
        error instanceof Error ? error.stack : '',
      );

      // Errores permanentes (argumento inválido, credenciales, etc.) nunca
      // van a cambiar con un reintento: cortamos de inmediato en vez de
      // gastar los intentos restantes y llamadas extra a Gemini.
      if (isPermanentError(error)) {
        const movedTo = await this.moveToReviewFolder(filePath);
        await this.documentRepository.updateState(
          documentId,
          DocumentState.MODEL_ERROR,
          {
            jsonModel: {
              error: errMsg,
              errorType: 'permanent_no_retry',
              timestamp: nowBogotaISOString(),
              ...(movedTo ? { archivoMovido: movedTo } : {}),
            },
          },
        );
        this.logger.warn(
          `Document ${documentId}: error permanente detectado, no se reintentará.`,
        );
        return;
      }

      // Update state to MODEL_ERROR before re-throwing for BullMQ retries
      await this.documentRepository.updateState(
        documentId,
        DocumentState.MODEL_ERROR,
        {
          jsonModel: {
            error: errMsg,
            timestamp: nowBogotaISOString(),
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
    const { documentId, filePath } = job.data;
    this.logger.error(
      `Job ${job.id} (Document ${documentId}) has failed permanently with ${err.message}`,
    );

    const movedTo = await this.moveToReviewFolder(filePath);

    // Update document state to MODEL_ERROR when all retries are exhausted
    try {
      await this.documentRepository.updateState(
        documentId,
        DocumentState.MODEL_ERROR,
        {
          jsonModel: {
            error: err.message,
            errorType: 'permanent_failure',
            timestamp: nowBogotaISOString(),
            attempts: job.attemptsMade,
            ...(movedTo ? { archivoMovido: movedTo } : {}),
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

  /**
   * Mueve un archivo a la carpeta de revisión (OCR_UNREADABLE_PATH) cuando
   * un documento queda en estado de error terminal en la etapa de IA
   * (permanente o tras agotar reintentos), para que no quede huérfano en
   * OCR_PATH dentro del contenedor.
   */
  private async moveToReviewFolder(filePath?: string): Promise<string | null> {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }

    try {
      await fs.promises.access(this.unreadablePath);
    } catch {
      await fs.promises.mkdir(this.unreadablePath, { recursive: true });
    }

    const destination = path.join(this.unreadablePath, path.basename(filePath));

    try {
      await fs.promises.rename(filePath, destination);
      return destination;
    } catch {
      try {
        await fs.promises.copyFile(filePath, destination);
        await fs.promises.unlink(filePath);
        return destination;
      } catch (moveErr: any) {
        this.logger.error(
          `No se pudo mover ${filePath} a la carpeta de revisión: ${moveErr.message}`,
        );
        return null;
      }
    }
  }
}
