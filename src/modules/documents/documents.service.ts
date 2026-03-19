import { Injectable } from '@nestjs/common';
import { DocumentRepository } from './repositories/document.repository';
import { GetDocumentsDto } from './dto/get-documents.dto';

@Injectable()
export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  async findAll(dto: GetDocumentsDto) {
    const page = dto.page || 1;
    const limit = dto.limit || 10;
    const skip = (page - 1) * limit;

    const result = await this.repository.findWithFilters({
      state: dto.state,
      startDate: dto.startDate,
      endDate: dto.endDate,
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
}
