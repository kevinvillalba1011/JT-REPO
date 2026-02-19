import { Injectable } from '@nestjs/common';
import { DocumentRepository } from './repositories/document.repository';

@Injectable()
export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  async findAll() {
    return this.repository.findAll();
  }
}
