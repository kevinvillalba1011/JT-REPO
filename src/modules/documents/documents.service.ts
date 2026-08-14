import { Injectable } from '@nestjs/common';
import { Document, DocumentState, IntegrationStatus } from '@prisma/client';
import { DocumentRepository } from './repositories/document.repository';
import { GetDocumentsDto } from './dto/get-documents.dto';
import { GetMetricsDto } from './dto/get-metrics.dto';

/**
 * El mensaje de error de un Document vive en un campo distinto según dónde
 * falló (ver document.repository.ts / ocr.processor.ts / model.processor.ts):
 * ERROR_OCR -> ocrText, MODEL_ERROR -> jsonModel.error, envío al sistema
 * externo fallido -> integrationError (independiente del state). Este campo
 * normaliza esos tres casos para que el consumidor de la API no tenga que
 * saber en cuál mirar.
 */
function deriveError(doc: Document): string | null {
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
  constructor(private readonly repository: DocumentRepository) {}

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
}
