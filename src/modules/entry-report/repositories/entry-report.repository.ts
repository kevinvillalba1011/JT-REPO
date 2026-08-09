import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { EntryReport } from '@prisma/client';
import { nowBogotaDate } from '@/common/utils/date.util';
import { MetadatosEntrada } from '@/common/utils/ruta-entrada.util';

@Injectable()
export class EntryReportRepository {
  private readonly logger = new Logger(EntryReportRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea o actualiza la fila de un lote de entrada identificado por la terna
   * (tipoOficio, fechaEntrada, corte). Una relectura del mismo corte con
   * archivos repuestos (ej. el cron vuelve a escanear una carpeta a la que
   * se agregaron más archivos, o se reinicia el proceso) debe SUMAR al
   * `numeroDocumentosEntrada` de la fila existente, nunca crear una fila
   * duplicada para el mismo lote — de ahí el `increment` en vez de un `set`.
   */
  async upsertPorClave(
    metadatos: MetadatosEntrada,
    archivosDescubiertos: number,
  ): Promise<EntryReport> {
    return this.prisma.entryReport.upsert({
      where: {
        tipoOficio_fechaEntrada_corte: {
          tipoOficio: metadatos.tipoOficio,
          fechaEntrada: metadatos.fechaEntrada,
          corte: metadatos.corte,
        },
      },
      create: {
        tipoOficio: metadatos.tipoOficio,
        fechaEntrada: metadatos.fechaEntrada,
        corte: metadatos.corte,
        ruta: metadatos.ruta,
        numeroDocumentosEntrada: archivosDescubiertos,
      },
      update: {
        numeroDocumentosEntrada: { increment: archivosDescubiertos },
        // La ruta puede variar entre relecturas (ej. cambio de raíz de
        // montaje), se refresca con la última conocida.
        ruta: metadatos.ruta,
      },
    });
  }

  async incrementarProcesados(id: string): Promise<void> {
    await this.prisma.entryReport.update({
      where: { id },
      data: { numeroDocumentosProcesados: { increment: 1 } },
    });
  }

  async incrementarError(id: string): Promise<void> {
    await this.prisma.entryReport.update({
      where: { id },
      data: { numeroDocumentosError: { increment: 1 } },
    });
  }

  /**
   * Descuenta un documento del total de entrada del lote.
   *
   * Necesario para el único caso en que un Document se ELIMINA en vez de
   * llegar a un estado terminal: el flujo masivo devuelve el Excel a su
   * carpeta de origen y borra el Document cuando falta el PDF asociado o la
   * plantilla es inválida (ver `MasivoProcessor.devolverArchivoAOrigen`).
   * Ese documento ya se había sumado a `numeroDocumentosEntrada` al escanear
   * la carpeta, pero nunca va a contarse en procesados ni en error — sin este
   * descuento la igualdad `entrada = procesados + error` jamás se cumpliría y
   * el lote nunca cerraría, dejando su reporte sin generar para siempre.
   *
   * El archivo vuelve a la carpeta de origen, así que el próximo escaneo lo
   * vuelve a descubrir y `upsertPorClave` lo vuelve a sumar: el contador
   * refleja en todo momento cuántos documentos hay realmente en vuelo.
   */
  async decrementarEntrada(id: string, cantidad = 1): Promise<void> {
    if (cantidad <= 0) return;
    await this.prisma.entryReport.update({
      where: { id },
      data: { numeroDocumentosEntrada: { decrement: cantidad } },
    });
  }

  async findByClave(
    tipoOficio: string,
    fechaEntrada: string,
    corte: string,
  ): Promise<EntryReport | null> {
    return this.prisma.entryReport.findUnique({
      where: {
        tipoOficio_fechaEntrada_corte: { tipoOficio, fechaEntrada, corte },
      },
    });
  }

  async findPorFechaYCorte(
    fechaEntrada: string,
    corte: string,
  ): Promise<EntryReport[]> {
    return this.prisma.entryReport.findMany({
      where: { fechaEntrada, corte },
    });
  }

  /**
   * Lotes "cerrados" (todo documento descubierto llegó a un estado terminal)
   * que todavía no tienen reporte generado. La condición compara dos
   * columnas entre sí (numero_documentos_entrada = procesados + error), algo
   * que el query builder de Prisma no soporta en un `where` (no hay forma de
   * referenciar una columna contra otra sin un valor literal), así que se
   * usa `$queryRaw` con SQL parametrizado.
   */
  async findCerradosSinReporte(): Promise<EntryReport[]> {
    return this.prisma.$queryRaw<EntryReport[]>`
      SELECT
        id,
        fecha_creacion AS "fechaCreacion",
        tipo_oficio AS "tipoOficio",
        fecha_entrada AS "fechaEntrada",
        corte,
        ruta,
        numero_documentos_entrada AS "numeroDocumentosEntrada",
        numero_documentos_procesados AS "numeroDocumentosProcesados",
        numero_documentos_error AS "numeroDocumentosError",
        reporte_generado_en AS "reporteGeneradoEn",
        reporte_ruta AS "reporteRuta"
      FROM entry_report
      WHERE reporte_generado_en IS NULL
        AND numero_documentos_entrada > 0
        AND numero_documentos_entrada = numero_documentos_procesados + numero_documentos_error
    `;
  }

  async marcarReporteGenerado(ids: string[], ruta: string): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.entryReport.updateMany({
      where: { id: { in: ids } },
      data: { reporteGeneradoEn: nowBogotaDate(), reporteRuta: ruta },
    });
  }

  /**
   * Incrementa el contador correspondiente de forma idempotente. El `jobId`
   * determinístico de BullMQ (`conteo-${documentId}`) evita que el MISMO job
   * se ejecute dos veces en paralelo, pero no cubre todos los caminos por
   * los que este método puede dispararse más de una vez para el mismo
   * documento: reprocesos manuales que vuelven a llevar el Document a un
   * estado terminal, un cron de recuperación que reencola tras un reinicio,
   * o un operador que reintenta manualmente un documento en error. Cualquiera
   * de esos casos produciría un jobId distinto pero el mismo documentId, así
   * que la defensa real vive en DB: `conteoRegistrado` se marca en la MISMA
   * transacción en la que se decide si incrementar, con un `updateMany`
   * condicionado a que todavía esté en `false` (atómico a nivel de fila).
   *
   * Retorna `true` si esta llamada fue la que efectivamente contó el
   * documento, `false` si ya estaba contado (para que el llamador solo
   * loguee, sin volver a incrementar).
   */
  async registrarConteoIdempotente(
    documentId: string,
    entryReportId: string,
    esError: boolean,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.document.updateMany({
        where: { id: documentId, conteoRegistrado: false },
        data: { conteoRegistrado: true },
      });

      if (count === 0) {
        // Ya se había registrado el conteo de este documento antes.
        return false;
      }

      await tx.entryReport.update({
        where: { id: entryReportId },
        data: esError
          ? { numeroDocumentosError: { increment: 1 } }
          : { numeroDocumentosProcesados: { increment: 1 } },
      });

      return true;
    });
  }
}
