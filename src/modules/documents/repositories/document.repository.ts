import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Document, DocumentState, Prisma } from '@prisma/client';

@Injectable()
export class DocumentRepository {
  private readonly logger = new Logger(DocumentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.DocumentCreateInput): Promise<Document> {
    try {
      this.logger.log(`Creating document with hash: ${data.md5Hash}`);
      return await this.prisma.document.create({
        data: {
          ...data,
          stateLogs: {
            create: {
              previousState: DocumentState.INGRESADO,
              newState: data.state,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(`Error creating document: ${error.message}`);
      throw error;
    }
  }

  async findByHash(md5Hash: string): Promise<Document | null> {
    return this.prisma.document.findFirst({
      where: { md5Hash },
    });
  }

  async updateState(
    id: string,
    state: DocumentState,
    extraData?: Prisma.DocumentUpdateInput,
  ): Promise<Document> {
    this.logger.log(`Updating document ${id} to state ${state}`);
    const currentDoc = await this.findById(id);

    return this.prisma.document.update({
      where: { id },
      data: {
        state: state,
        ...extraData,
        stateLogs: {
          create: {
            previousState: currentDoc ? currentDoc.state : null,
            newState: state,
          },
        },
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
      include: { stateLogs: true },
    });
  }

  async findByState(state: DocumentState): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { state },
    });
  }

  async findWithFilters(filters: {
    state?: DocumentState;
    startDate?: string;
    endDate?: string;
    skip: number;
    take: number;
  }): Promise<{ data: Document[]; total: number }> {
    const { state, startDate, endDate, skip, take } = filters;

    const whereClause: Prisma.DocumentWhereInput = {};

    if (state) whereClause.state = state;

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt.gte = new Date(startDate);
      if (endDate) whereClause.createdAt.lte = new Date(endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { stateLogs: true },
      }),
      this.prisma.document.count({ where: whereClause }),
    ]);

    return { data, total };
  }

  async getMetrics() {
    const groups = await this.prisma.document.groupBy({
      by: ['state'],
      _count: true,
    });

    const total = await this.prisma.document.count();

    const stats = groups.reduce(
      (acc, curr) => {
        acc[curr.state] = curr._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      stats,
    };
  }
}
