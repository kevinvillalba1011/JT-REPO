import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { IntegrationService } from '../../integration/integration.service';
import {
  applyNombreOficioFinalSuffix,
  mapRowToPayload,
  SUPPORTED_TIPOS_OFICIO,
} from './excel-field-mapping';

export interface BatchResult {
  loteId: string;
  enviados: number;
  fallidos: number;
  filasFallidas: number[];
}

interface ParsedRow {
  numeroFila: number;
  payload: Record<string, any>;
}

const TITLE_ROW_PATTERN = /PLANTILLA DE DILIGENCIAMIENTO/i;

@Injectable()
export class MassiveExcelService {
  private readonly logger = new Logger(MassiveExcelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly integrationService: IntegrationService,
  ) {}

  async process(filePath: string, fileName: string): Promise<BatchResult> {
    this.logger.log(
      `[1/4] Iniciando procesamiento de Excel masivo: ${fileName}`,
    );

    await this.prisma.excelRecord.deleteMany({
      where: { excelName: fileName },
    });
    this.logger.log(
      `[1/4] Registros previos de ${fileName} eliminados (idempotencia).`,
    );

    // Paso 1 — Parsear todas las filas
    const { tipoOficio, rows } = await this.parseWorkbook(filePath);
    const totalRegistros = rows.length;

    this.logger.log(
      `[1/4] Tipo detectado: ${tipoOficio}. Total filas parseadas: ${totalRegistros}`,
    );

    // Paso 2 — Notificar al receptor y esperar el loteId antes de continuar
    const loteSize = this.configService.get<number>(
      'INTEGRATION_LOTE_SIZE',
      100,
    );
    const cantidadLotes = Math.ceil(totalRegistros / loteSize);
    const tipoOficioMasivo = `${tipoOficio} MASIVO`;

    this.logger.log(
      `[2/4] Solicitando inicio de lote: nombreArchivo=${fileName}, cantidadLotes=${cantidadLotes}, totalRegistros=${totalRegistros}, tipoOficio=${tipoOficioMasivo}`,
    );

    const loteId = await this.integrationService.startBatch(
      fileName,
      cantidadLotes,
      totalRegistros,
      tipoOficioMasivo,
    );

    this.logger.log(
      `[2/4] loteId obtenido: ${loteId}. Procediendo a persistir y enviar filas.`,
    );

    // Inyectar idLote y tipoOficio MASIVO en cada payload antes de persistir
    for (const row of rows) {
      if (row.payload.oficio && typeof row.payload.oficio === 'object') {
        row.payload.oficio.idLote = loteId;
        row.payload.oficio.tipoOficio = tipoOficioMasivo;
      }
    }

    // Guardar en DB con el payload final (incluye idLote y tipoOficio MASIVO)
    if (rows.length > 0) {
      const BATCH_SIZE = 500;
      const data = rows.map((r) => ({
        excelName: fileName,
        tipoOficio: tipoOficioMasivo,
        numeroFila: r.numeroFila,
        payload: r.payload,
      }));

      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        await this.prisma.excelRecord.createMany({
          data: data.slice(i, i + BATCH_SIZE),
        });
      }
      this.logger.log(`[2/4] ${data.length} filas persistidas en ExcelRecord.`);
    }

    // Paso 3 — Enviar cada fila con concurrencia controlada
    const CONCURRENCY = this.configService.get<number>(
      'INTEGRATION_BATCH_CONCURRENCY',
      5,
    );
    const MAX_RETRIES = 3;
    const filasFallidas: number[] = [];
    let enviados = 0;

    this.logger.log(
      `[3/4] Enviando ${totalRegistros} filas a recepcionar (concurrencia=${CONCURRENCY}).`,
    );

    const tasks = rows.map((row) => async () => {
      const success = await this.sendRowWithRetry(
        loteId,
        row.numeroFila,
        row.payload,
        MAX_RETRIES,
      );
      if (success) {
        enviados++;
      } else {
        filasFallidas.push(row.numeroFila);
      }
    });

    await this.runConcurrently(tasks, CONCURRENCY);

    // Paso 4 — Retornar resumen
    const result: BatchResult = {
      loteId,
      enviados,
      fallidos: filasFallidas.length,
      filasFallidas,
    };

    this.logger.log(
      `[4/4] Batch finalizado. loteId=${loteId} enviados=${enviados} fallidos=${filasFallidas.length}`,
    );

    return result;
  }

  /**
   * Lee el workbook en modo streaming (la opción 'hyperlinks: ignore' / 'styles: ignore'
   * evita el bug de exceljs@4.4.0 que falla leyendo comentarios de celda) y detecta el
   * tipo de oficio (EMBARGO/DESEMBARGO/ALCANCE) a partir del nombre de la primera hoja,
   * mapeando cada fila al JSON final.
   */
  private async parseWorkbook(filePath: string): Promise<{
    tipoOficio: string;
    rows: ParsedRow[];
  }> {
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      entries: 'emit',
      sharedStrings: 'cache',
      hyperlinks: 'ignore',
      styles: 'ignore',
      worksheets: 'emit',
    });

    let sheetName = '';
    const dataRows: any[][] = [];

    for await (const worksheetReader of workbookReader) {
      sheetName = (worksheetReader as unknown as { name?: string }).name ?? '';

      for await (const row of worksheetReader) {
        // row.values es 1-indexado (índice 0 vacío); lo normalizamos a 0-indexado
        dataRows.push((row.values as any[]).slice(1));
      }

      // Solo procesamos la primera hoja
      break;
    }

    const tipoOficio = this.resolveTipoOficio(sheetName, filePath);
    const fechaProcesamiento = new Date().toISOString();

    if (dataRows.length === 0) {
      return { tipoOficio, rows: [] };
    }

    // La primera fila puede ser un título ("PLANTILLA DE DILIGENCIAMIENTO — ...")
    // En ese caso, los encabezados están en la segunda fila y los datos desde la tercera.
    // Con celdas mergeadas el título puede ocupar varias columnas, así que solo
    // verificamos que el texto del primer valor no-vacío coincida con el patrón.
    let headerIndex = 0;
    for (let r = 0; r < Math.min(dataRows.length, 3); r++) {
      const row = dataRows[r] || [];
      const firstNonEmpty = row.find(
        (c: unknown) => c !== undefined && c !== null && c !== '',
      );
      if (
        firstNonEmpty &&
        TITLE_ROW_PATTERN.test(String(firstNonEmpty))
      ) {
        headerIndex = r + 1;
        this.logger.debug(
          `[parseWorkbook] Fila título detectada en índice ${r}: "${String(firstNonEmpty).substring(0, 60)}"`,
        );
        break;
      }
    }

    const headers = dataRows[headerIndex] || [];
    this.logger.debug(
      `[parseWorkbook] headerIndex=${headerIndex}, headers (normalizados): ${headers.map((h: unknown) => String(h ?? '').trim().substring(0, 30)).join(' | ')}`,
    );
    const rows: ParsedRow[] = [];

    const now = new Date();
    const mmdd =
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const baseConsecutivo = await this.countExcelRecordsToday();

    // Saltar filas descriptivas/ejemplo entre el header y los datos reales.
    // Estas filas contienen texto como "Numérico Máximo", "Alfabético", "Sin puntos ni comas. Ej:"
    const DESCRIPTION_ROW_PATTERN =
      /^(num[eé]rico|alfab[eé]tico|alfanum[eé]rico|sin puntos|caracteres|[A-Z]\s*\/\s*[A-Z]{1,3}\s*\/)/i;

    let dataStartIndex = headerIndex + 1;
    for (let i = headerIndex + 1; i < Math.min(dataRows.length, headerIndex + 4); i++) {
      const row = dataRows[i] || [];
      const firstNonEmpty = row.find(
        (c: unknown) => c !== undefined && c !== null && c !== '',
      );
      if (firstNonEmpty && DESCRIPTION_ROW_PATTERN.test(String(firstNonEmpty).trim())) {
        this.logger.debug(
          `[parseWorkbook] Saltando fila descriptiva en índice ${i}: "${String(firstNonEmpty).substring(0, 50)}"`,
        );
        dataStartIndex = i + 1;
      } else {
        break;
      }
    }

    this.logger.debug(`[parseWorkbook] Datos reales comienzan en índice ${dataStartIndex}`);

    for (let i = dataStartIndex; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (
        !row ||
        row.length === 0 ||
        row.every((c) => c === undefined || c === null || c === '')
      ) {
        continue;
      }

      const payload = mapRowToPayload(
        headers,
        row,
        tipoOficio,
        fechaProcesamiento,
      );
      applyNombreOficioFinalSuffix(
        payload,
        mmdd,
        baseConsecutivo + rows.length + 1,
      );

      rows.push({
        numeroFila: rows.length + 1,
        payload,
      });
    }

    return { tipoOficio, rows };
  }

  /** Cuenta los `ExcelRecord` ya guardados hoy, usado como base del consecutivo de `nombreOficioFinal`. */
  private async countExcelRecordsToday(): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.prisma.excelRecord.count({
      where: { createdAt: { gte: startOfDay } },
    });
  }

  /** Detecta el tipo de oficio por nombre de hoja, con fallback al nombre del archivo. */
  private resolveTipoOficio(sheetName: string, filePath: string): string {
    const normalizedSheet = sheetName?.trim().toUpperCase();
    if (SUPPORTED_TIPOS_OFICIO.includes(normalizedSheet)) {
      return normalizedSheet;
    }

    const baseName = path.basename(filePath).toUpperCase();
    const found = SUPPORTED_TIPOS_OFICIO.find((tipo) =>
      baseName.includes(tipo),
    );

    return found ?? 'DESCONOCIDO';
  }

  private async sendRowWithRetry(
    loteId: string,
    numeroFila: number,
    payload: Record<string, any>,
    maxRetries: number,
  ): Promise<boolean> {
    const body: Record<string, unknown> = { ...payload, numeroFila };
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.debug(
        `[3/4] Fila ${numeroFila} -> recepcionar (intento ${attempt}/${maxRetries}, loteId=${loteId})`,
      );
      try {
        const sent = await this.integrationService.sendData(body, 'EXCEL_ROW');
        if (sent) {
          this.logger.debug(`[3/4] Fila ${numeroFila} enviada correctamente.`);
          return true;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Fila ${numeroFila} intento ${attempt}/${maxRetries} falló: ${message}`,
        );
      }

      if (attempt < maxRetries) {
        await this.sleep(RETRY_DELAY_MS * attempt);
      }
    }

    this.logger.error(
      `Fila ${numeroFila} falló definitivamente tras ${maxRetries} intentos.`,
    );
    return false;
  }

  private async runConcurrently(
    tasks: (() => Promise<void>)[],
    limit: number,
  ): Promise<void> {
    let index = 0;

    async function worker() {
      while (index < tasks.length) {
        const i = index++;
        await tasks[i]();
      }
    }

    const workers = Array.from(
      { length: Math.min(limit, tasks.length) },
      worker,
    );
    await Promise.all(workers);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
