import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Document, DocumentState, Prisma } from '@prisma/client';

@Injectable()
export class DocumentRepository {
  private readonly logger = new Logger(DocumentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.DocumentCreateInput): Promise<Document> {
    try {
      this.logger.log(`Creating document with hash: ${data.hash_md5}`);
      return await this.prisma.document.create({ data });
    } catch (error) {
      this.logger.error(`Error creating document: ${error.message}`);
      throw error;
    }
  }

  async findByHash(hash_md5: string): Promise<Document | null> {
    return this.prisma.document.findUnique({
      where: { hash_md5 },
    });
  }

  async updateState(id: string, state: DocumentState, extraData?: Prisma.DocumentUpdateInput): Promise<Document> {
    this.logger.log(`Updating document ${id} to state ${state}`);
    return this.prisma.document.update({
      where: { id },
      data: {
        estado: state,
        ...extraData,
      },
    });
  }

  async findById(id: string): Promise<Document | null> {
    return this.prisma.document.findUnique({
      where: { id },
    });
  }

  async findAll(): Promise<Document[]> {
    return this.prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByState(state: DocumentState): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { estado: state },
    });
  }
}
