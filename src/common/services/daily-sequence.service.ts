import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

@Injectable()
export class DailySequenceService {
  private readonly logger = new Logger(DailySequenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene el siguiente consecutivo del día de forma atómica (sin race conditions).
   * Retorna el objeto { mmdd, consecutivo } listo para usar en nombreOficioFinal.
   */
  async getNext(): Promise<{ mmdd: string; consecutivo: string }> {
    const now = new Date();
    const mmdd =
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');

    const todayStr = now.toISOString().slice(0, 10);

    const result = await this.prisma.$queryRawUnsafe<
      { next_daily_sequence: number }[]
    >(`SELECT next_daily_sequence($1::date)`, todayStr);

    const seq = result[0]?.next_daily_sequence ?? 1;
    const consecutivo = String(seq).padStart(4, '0');

    this.logger.debug(`Consecutivo del día ${todayStr}: ${consecutivo}`);

    return { mmdd, consecutivo };
  }
}
