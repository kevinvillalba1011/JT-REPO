import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { EntryReport } from '@prisma/client';
import { EntryReportRepository } from './repositories/entry-report.repository';
import { nowBogotaDate, formatBogotaDate } from '@/common/utils/date.util';

const HEADERS = [
  'FECHA DEL CORTE',
  'NUMERO DE CORTE',
  'NOMBRE INICIAL',
  'NOMBRE FINAL',
  'TIPO DE OFICIO',
  'FECHA DE CREACION',
] as const;

/**
 * Genera el Excel de "reporte de entrada": un consolidado por
 * (fechaEntrada, corte) con una fila por cada `Document` que llegó en ese
 * corte, sin importar de qué `tipoOficio` (carpeta) provino. Complementa a
 * `EntryReportRepository`, que solo lleva los contadores agregados por lote
 * (una fila por tipoOficio) — este servicio es el que efectivamente arma el
 * archivo que se entrega/consulta.
 */
@Injectable()
export class EntryReportExcelService {
  private readonly logger = new Logger(EntryReportExcelService.name);

  private readonly reporteEntradaPath: string;

  constructor(
    private readonly entryReportRepository: EntryReportRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Mismo patrón que ExtractionService (IN_PATH/OCR_PATH): resolver contra
    // process.cwd() para que la ruta quede SIEMPRE absoluta, sin importar si
    // el valor configurado en el .env es relativo (ej. en local) o absoluto
    // (ej. en Docker, "/opt/reporte_entrada").
    this.reporteEntradaPath = path.resolve(
      process.cwd(),
      this.configService.get<string>(
        'REPORTE_ENTRADA_PATH',
        './local/reporte_entrada',
      ),
    );
  }

  /**
   * Arma y escribe el Excel consolidado de un corte específico
   * (fechaEntrada + corte), y marca los lotes involucrados como reportados.
   *
   * El Excel es UN SOLO archivo por corte que mezcla todos los tipos de
   * oficio que cayeron en ese corte (una hoja con todas las filas). Por eso
   * no basta con que el lote que disparó la llamada esté cerrado: si otro
   * tipoOficio del MISMO corte sigue abierto, escribir el archivo ahora
   * dejaría filas faltantes que nadie volvería a agregar (el archivo ya
   * quedaría marcado/entregado). En cambio, esperar a que TODOS los lotes de
   * la terna (fechaEntrada, corte) cierren garantiza que el archivo se
   * escribe una sola vez y completo.
   *
   * `opciones.forzar` existe para un endpoint manual de relectura: un
   * operador que necesita regenerar el Excel de un corte ya reportado (por
   * ejemplo porque se corrigió `nombreOficioFinal` de algún documento a
   * mano) puede pedirlo explícitamente, saltándose tanto la validación de
   * cierre como el hecho de que `reporteGeneradoEn` ya esté seteado.
   *
   * Retorna `null` si no hay lotes para esa terna, o si no forzó y todavía
   * hay lotes abiertos.
   */
  async generarReporte(
    fechaEntrada: string,
    corte: string,
    opciones?: { forzar?: boolean },
  ): Promise<{ ruta: string; filas: number } | null> {
    const forzar = opciones?.forzar === true;

    const lotes = await this.entryReportRepository.findPorFechaYCorte(
      fechaEntrada,
      corte,
    );

    if (lotes.length === 0) {
      this.logger.debug(
        `No existen lotes de entry_report para fechaEntrada=${fechaEntrada} corte=${corte}, no hay nada que reportar.`,
      );
      return null;
    }

    if (!forzar) {
      const abiertos = lotes.filter((lote) => !this.estaCerrado(lote));
      if (abiertos.length > 0) {
        this.logger.debug(
          `fechaEntrada=${fechaEntrada} corte=${corte}: ${abiertos.length}/${lotes.length} lote(s) todavía abiertos ` +
            `(${abiertos.map((l) => l.tipoOficio).join(', ')}). Se pospone la generación del Excel consolidado.`,
        );
        return null;
      }
    }

    const ids = lotes.map((lote) => lote.id);
    const documentos = await this.prisma.document.findMany({
      where: { entryReportId: { in: ids } },
      orderBy: [{ tipoOficio: 'asc' }, { fileName: 'asc' }],
    });

    const ruta = this.resolverRutaReporte(fechaEntrada, corte);
    await fs.promises.mkdir(path.dirname(ruta), { recursive: true });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de entrada');

    const headerRow = worksheet.addRow([...HEADERS]);
    headerRow.font = { bold: true };

    const fechaCreacion = formatBogotaDate(nowBogotaDate());

    for (const lote of lotes) {
      const documentosDelLote = documentos.filter(
        (doc) => doc.entryReportId === lote.id,
      );
      for (const documento of documentosDelLote) {
        worksheet.addRow([
          lote.fechaEntrada,
          lote.corte,
          documento.fileName,
          documento.nombreOficioFinal ?? '',
          documento.tipoOficio ?? '',
          fechaCreacion,
        ]);
      }
    }

    // Sobrescribe si ya existía (ej. una regeneración con forzar=true).
    await workbook.xlsx.writeFile(ruta);

    await this.entryReportRepository.marcarReporteGenerado(ids, ruta);

    this.logger.log(
      `Reporte de entrada generado: fechaEntrada=${fechaEntrada} corte=${corte} archivo="${ruta}" filas=${documentos.length}` +
        (forzar ? ' (forzado)' : ''),
    );

    return { ruta, filas: documentos.length };
  }

  /**
   * Cron que revisa periódicamente qué lotes quedaron cerrados sin reporte
   * (`findCerradosSinReporte`) y dispara `generarReporte` una vez por cada
   * terna (fechaEntrada, corte) distinta encontrada.
   *
   * El decorador `@Cron` se evalúa al importar el módulo (antes de que Nest
   * construya el `ConfigService`), así que no puede leer la configuración
   * vía inyección de dependencias — de ahí que, igual que en
   * `ExtractionService.handleCron` y `ReportService.handleReport`, se lea
   * `process.env` directamente en el decorador en vez de usar `ConfigService`.
   */
  @Cron(process.env.CRON_ENTRY_REPORT_SCHEDULE || '*/5 * * * *')
  async handleEntryReportCron(): Promise<void> {
    const lotesCerrados = await this.entryReportRepository.findCerradosSinReporte();

    if (lotesCerrados.length === 0) {
      this.logger.debug('No hay lotes cerrados pendientes de reporte.');
      return;
    }

    const cortes = this.agruparPorFechaYCorte(lotesCerrados);
    this.logger.log(
      `Encontrados ${lotesCerrados.length} lote(s) cerrado(s) sin reporte, agrupados en ${cortes.size} corte(s).`,
    );

    let archivosEscritos = 0;
    for (const [, { fechaEntrada, corte }] of cortes) {
      try {
        const resultado = await this.generarReporte(fechaEntrada, corte);
        if (resultado) {
          archivosEscritos++;
        }
      } catch (error: unknown) {
        // Un corte que falla (ej. error de I/O al escribir su Excel) no debe
        // abortar los demás — se loguea y se sigue con el siguiente.
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Error generando el reporte de entrada para fechaEntrada=${fechaEntrada} corte=${corte}: ${msg}`,
        );
      }
    }

    this.logger.log(
      `Cron de reporte de entrada finalizado: ${archivosEscritos}/${cortes.size} archivo(s) escrito(s).`,
    );
  }

  /** Un lote está cerrado cuando todo documento descubierto llegó a un estado terminal. */
  private estaCerrado(lote: EntryReport): boolean {
    return (
      lote.numeroDocumentosEntrada ===
      lote.numeroDocumentosProcesados + lote.numeroDocumentosError
    );
  }

  private agruparPorFechaYCorte(
    lotes: EntryReport[],
  ): Map<string, { fechaEntrada: string; corte: string }> {
    const grupos = new Map<string, { fechaEntrada: string; corte: string }>();
    for (const lote of lotes) {
      const clave = `${lote.fechaEntrada}::${lote.corte}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          fechaEntrada: lote.fechaEntrada,
          corte: lote.corte,
        });
      }
    }
    return grupos;
  }

  /**
   * Ruta destino del reporte: `<REPORTE_ENTRADA_PATH>/<yyyyMMdd>/CORTE_[n].xlsx`.
   *
   * El segmento "reporte_entrada" NO se agrega aquí: ya forma parte del valor
   * de REPORTE_ENTRADA_PATH (`./local/reporte_entrada` en local,
   * `/opt/reporte_entrada` en el contenedor, que es donde monta el volumen
   * SERVER_PATH_REPORTE_ENTRADA). Concatenarlo de nuevo duplicaba la carpeta
   * (`/opt/reporte_entrada/reporte_entrada/...`). Mismo criterio que el resto
   * de rutas del repo (OCR_DESTINATION_PATH, EXCEL_DESTINATION_PATH...), donde
   * la variable de entorno apunta directo a la carpeta final.
   */
  private resolverRutaReporte(fechaEntrada: string, corte: string): string {
    return path.join(this.reporteEntradaPath, fechaEntrada, `${corte}.xlsx`);
  }
}
