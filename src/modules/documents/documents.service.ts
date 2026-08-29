import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { Document, DocumentState, IntegrationStatus } from '@prisma/client';
import { DocumentRepository } from './repositories/document.repository';
import { GetDocumentsDto } from './dto/get-documents.dto';
import { GetMetricsDto } from './dto/get-metrics.dto';
import { GetErroresIaDto } from './dto/get-errores-ia.dto';
import { formatBogotaYYYYMMDD } from '@/common/utils/date.util';

/**
 * El mensaje de error de un Document vive en un campo distinto según dónde
 * falló (ver document.repository.ts / ocr.processor.ts / model.processor.ts):
 * ERROR_OCR -> ocrText, MODEL_ERROR -> jsonModel.error, envío al sistema
 * externo fallido -> integrationError (independiente del state). Este campo
 * normaliza esos tres casos para que el consumidor de la API no tenga que
 * saber en cuál mirar. Exportada para que GET /documents/errores-ia (mismo
 * campo "error" en su response) la reutilice en vez de duplicar la lógica.
 */
export function deriveError(doc: Document): string | null {
  if (doc.state === DocumentState.ERROR_OCR) return doc.ocrText ?? null;
  if (doc.state === DocumentState.MODEL_ERROR) {
    const jsonModel = doc.jsonModel as { error?: string } | null;
    return jsonModel?.error ?? null;
  }
  if (doc.integrationStatus === IntegrationStatus.FALLIDO) {
    return doc.integrationError ?? null;
  }
  return null;
}

@Injectable()
export class DocumentService {
  private readonly unsupportedPath: string;
  private readonly ocrUnreadablePath: string;

  constructor(
    private readonly repository: DocumentRepository,
    private readonly configService: ConfigService,
  ) {
    // Mismas rutas (y mismos defaults) que ExtractionService/OcrProcessor —
    // se leen del ConfigService acá también para derivar `ruta` cuando
    // `documents.ruta_archivo` es null (documentos que fallaron antes de
    // esta columna existir).
    this.unsupportedPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('UNSUPPORTED_PATH', './local/unsupported'),
    );
    this.ocrUnreadablePath = path.resolve(
      process.cwd(),
      this.configService.get<string>(
        'OCR_UNREADABLE_PATH',
        './local/ocr-unreadable',
      ),
    );
  }

  async findAll(dto: GetDocumentsDto) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 10;
    const skip = (page - 1) * limit;

    const result = await this.repository.findWithFilters({
      state: dto.state,
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin,
      fechaEntrada: dto.fechaEntrada,
      corte: dto.corte,
      skip,
      take: limit,
    });

    return {
      data: result.data.map((doc) => ({ ...doc, error: deriveError(doc) })),
      meta: {
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  }

  async getMetrics(dto: GetMetricsDto = {}) {
    return this.repository.getMetrics({
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin,
      fechaEntrada: dto.fechaEntrada,
      corte: dto.corte,
    });
  }

  /**
   * GET /documents/errores-ia: documentos en estado de error IA
   * (MODEL_ERROR / ERROR_OCR / FORMATO_NO_SOPORTADO) dentro del rango
   * [fechaInicio, fechaFin] de fecha EFECTIVA (fecha_entrada, con fallback a
   * created_at — ver DocumentRepository.findErroresIa). Mismo sobre
   * { data, meta } que findAll().
   */
  async getErroresIa(dto: GetErroresIaDto) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 25;
    const skip = (page - 1) * limit;

    const result = await this.repository.findErroresIa({
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin,
      skip,
      take: limit,
    });

    return {
      data: result.data.map((doc) => ({
        nombreArchivo: doc.fileName,
        createdAt: doc.createdAt,
        fechaEntrada: doc.fechaEntrada ?? formatBogotaYYYYMMDD(doc.createdAt),
        corte: doc.corte ?? 'SIN CORTE',
        estado: doc.state,
        error: deriveError(doc),
        ruta: doc.rutaArchivo ?? this.derivarRuta(doc),
      })),
      meta: {
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  }

  /**
   * Fallback cuando `documents.ruta_archivo` es null (documentos que
   * fallaron antes de que esa columna existiera, ver migración
   * 20260815_document_ruta_archivo): reconstruye la ruta a la que
   * `ExtractionService`/`OcrProcessor`/`ModelProcessor`/`MasivoProcessor`
   * mueven el archivo según el estado — no_soportados (UNSUPPORTED_PATH)
   * para FORMATO_NO_SOPORTADO, o revisión (OCR_UNREADABLE_PATH, en la
   * subcarpeta de la fecha efectiva) para el resto.
   */
  private derivarRuta(doc: Document): string {
    if (doc.state === DocumentState.FORMATO_NO_SOPORTADO) {
      return path.join(this.unsupportedPath, doc.fileName);
    }
    const fechaEntradaEfectiva =
      doc.fechaEntrada ?? formatBogotaYYYYMMDD(doc.createdAt);
    return path.join(
      this.ocrUnreadablePath,
      fechaEntradaEfectiva,
      doc.fileName,
    );
  }
}
