import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Document, DocumentState, Prisma } from '@prisma/client';
import {
  nowBogotaDate,
  parseDateRangeBoundary,
} from '@/common/utils/date.util';

@Injectable()
export class DocumentRepository {
  private readonly logger = new Logger(DocumentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.DocumentCreateInput): Promise<Document> {
    try {
      this.logger.log(`Creating document: ${data.fileName}`);
      return await this.prisma.document.create({
        data: {
          ...data,
          createdAt: nowBogotaDate(),
          updatedAt: nowBogotaDate(),
          stateLogs: {
            create: {
              previousState: DocumentState.INGRESADO,
              newState: data.state,
              createdAt: nowBogotaDate(),
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

  async findByFileName(fileName: string): Promise<Document | null> {
    return this.prisma.document.findFirst({
      where: { fileName },
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
        updatedAt: nowBogotaDate(),
        stateLogs: {
          create: {
            previousState: currentDoc ? currentDoc.state : null,
            newState: state,
            createdAt: nowBogotaDate(),
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

  /**
   * Elimina un Document (y sus stateLogs, vía onDelete: Cascade). Usado
   * cuando un intento de procesamiento se descarta por completo sin haber
   * ocurrido (ej. Excel masivo sin PDF asociado): no queda ningún registro,
   * como si el archivo nunca hubiese sido descubierto — el próximo escaneo
   * del cron lo vuelve a recoger y crea un Document nuevo si corresponde.
   */
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.document.delete({ where: { id } });
    } catch (error: any) {
      // P2025 = registro no encontrado (ya eliminado por otro intento/job).
      // No es un error real en ese caso: el resultado deseado (que no exista)
      // ya se cumple.
      if (error?.code !== 'P2025') {
        throw error;
      }
    }
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
      if (startDate)
        whereClause.createdAt.gte = parseDateRangeBoundary(startDate, false);
      if (endDate)
        whereClause.createdAt.lte = parseDateRangeBoundary(endDate, true);
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

  async countProcessedToday(): Promise<number> {
    const bogotaNow = nowBogotaDate();
    const startOfDay = new Date(
      Date.UTC(
        bogotaNow.getUTCFullYear(),
        bogotaNow.getUTCMonth(),
        bogotaNow.getUTCDate(),
      ),
    );
    return this.prisma.document.count({
      where: {
        state: DocumentState.IA_OK,
        createdAt: { gte: startOfDay },
      },
    });
  }

  async getMetrics(filters?: { fechaInicio?: string; fechaFin?: string }) {
    const whereClause: Prisma.DocumentWhereInput = {};
    if (filters?.fechaInicio || filters?.fechaFin) {
      whereClause.createdAt = {};
      if (filters.fechaInicio)
        whereClause.createdAt.gte = parseDateRangeBoundary(
          filters.fechaInicio,
          false,
        );
      if (filters.fechaFin)
        whereClause.createdAt.lte = parseDateRangeBoundary(
          filters.fechaFin,
          true,
        );
    }

    const groups = await this.prisma.document.groupBy({
      where: whereClause,
      by: ['state'],
      _count: true,
    });

    const total = await this.prisma.document.count({ where: whereClause });

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
