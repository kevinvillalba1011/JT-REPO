import { Injectable } from '@nestjs/common';
import { DocumentRepository } from './repositories/document.repository';
import { GetDocumentsDto } from './dto/get-documents.dto';
import { GetMetricsDto } from './dto/get-metrics.dto';

@Injectable()
export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  async findAll(dto: GetDocumentsDto) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 10;
    const skip = (page - 1) * limit;

    // fechaInicio/fechaFin son los nombres canónicos; startDate/endDate se
    // mantienen por compatibilidad. Si llegan ambos, ganan los nuevos.
    const startDate = dto.fechaInicio ?? dto.startDate;
    const endDate = dto.fechaFin ?? dto.endDate;

    const result = await this.repository.findWithFilters({
      state: dto.state,
      startDate,
      endDate,
      skip,
      take: limit,
    });

    return {
      data: result.data,
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
    });
  }
}
