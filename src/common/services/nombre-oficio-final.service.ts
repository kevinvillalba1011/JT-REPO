import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Deduplica `nombreOficioFinal` contra la tabla persistente
 * `nombres_oficio_final_usados` — a diferencia de `resolverRutaSinColision`
 * (file-destination.util.ts), que solo detecta colisiones dentro de la
 * subcarpeta de la fecha del día actual en el filesystem, esta deduplicación
 * es contra TODA la historia en base de datos, sin importar cuándo se generó
 * el nombre previo.
 *
 * IMPORTANTE — cambio de comportamiento intencional: el sufijo "-N" que se
 * agrega ante una colisión pasa a ser parte OFICIAL de nombreOficioFinal (se
 * persiste en Document/ExcelRecord, se envía al sistema externo vía
 * IntegrationService, y se usa para nombrar el archivo físico). Esto es
 * distinto del sufijo que agrega `resolverRutaSinColision`, que es puramente
 * cosmético del nombre de archivo y nunca toca el campo lógico.
 */
@Injectable()
export class NombreOficioFinalService {
  private readonly logger = new Logger(NombreOficioFinalService.name);

  // Límite defensivo para no loopear indefinidamente ante un bug o dato
  // corrupto que produzca colisión perpetua.
  private static readonly MAX_INTENTOS = 1000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserva `candidato` como nombreOficioFinal único de forma atómica.
   *
   * Atomicidad: la tabla tiene un constraint UNIQUE en `nombreOficioFinal`.
   * Se intenta un INSERT del candidato base; si otro proceso ya lo reservó,
   * Postgres rechaza el INSERT con la violación de unicidad 23505 (Prisma la
   * traduce al código propio P2002) y se reintenta con el siguiente sufijo
   * ("-1", "-2", ...) hasta que un INSERT tenga éxito. El propio INSERT
   * exitoso ES la reserva — no hay ventana de carrera entre "verificar si
   * existe" y "guardarlo", como sí la habría con un SELECT previo.
   *
   * Dos jobs procesando en paralelo con el mismo candidato nunca terminan con
   * el mismo nombreOficioFinal: como mucho uno de los dos gana cada intento
   * de INSERT, así que divergen en el sufijo.
   */
  async resolverUnico(candidato: string): Promise<string> {
    const base = (candidato ?? '').trim();
    let intento = base;
    let sufijo = 0;

    for (let i = 0; i < NombreOficioFinalService.MAX_INTENTOS; i++) {
      try {
        await this.prisma.nombreOficioFinalUsado.create({
          data: { nombreOficioFinal: intento },
        });

        if (sufijo > 0) {
          this.logger.warn(
            `nombreOficioFinal "${base}" ya estaba en uso; se reservó como "${intento}".`,
          );
        }

        return intento;
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          sufijo += 1;
          intento = `${base}-${sufijo}`;
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `No se pudo reservar un nombreOficioFinal único para "${base}" tras ${NombreOficioFinalService.MAX_INTENTOS} intentos.`,
    );
  }
}
