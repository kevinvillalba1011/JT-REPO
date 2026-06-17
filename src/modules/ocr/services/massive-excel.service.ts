import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { IntegrationService } from '../../integration/integration.service';
import { DailySequenceService } from '@/common/services/daily-sequence.service';
import { mapRowToPayload, SUPPORTED_TIPOS_OFICIO } from './excel-field-mapping';

export interface BatchResult {
  loteId: string;
  enviados: number;
  fallidos: number;
  filasFallidas: number[];
  lotesEnviados: Record<string, any>[];
}

interface ParsedRow {
  numeroFila: number;
  payload: Record<string, any>;
}

const TITLE_ROW_PATTERN = /PLANTILLA DE DILIGENCIAMIENTO/i;
const OFICIO_PLACEHOLDER = /00000000|MMDDconsecutivo4Digitos/;

@Injectable()
export class MassiveExcelService {
  private readonly logger = new Logger(MassiveExcelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly integrationService: IntegrationService,
    private readonly dailySequence: DailySequenceService,
  ) {}

  async process(filePath: string, fileName: string): Promise<BatchResult> {
    this.logger.verbose(
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

    if (totalRegistros === 0) {
      return {
        loteId: 'LOCAL',
        enviados: 0,
        fallidos: 0,
        filasFallidas: [],
        lotesEnviados: [],
      };
    }

    // Paso 2 — Notificar al receptor y esperar el loteId antes de continuar
    const tipoOficioMasivo = `${tipoOficio} MASIVO`;

    const loteSize = this.configService.get<number>(
      'INTEGRATION_LOTE_SIZE',
      100,
    );
    const cantidadLotes = Math.ceil(totalRegistros / loteSize);

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
      `[2/4] loteId obtenido: ${loteId}. Construyendo payload consolidado.`,
    );

    // Paso 3 — Resolver nombreOficioFinal UNA sola vez para todo el lote
    const baseOficio = (rows[0].payload.oficio ?? {}) as Record<string, any>;
    let nombreOficioFinal =
      typeof baseOficio.nombreOficioFinal === 'string'
        ? baseOficio.nombreOficioFinal
        : '';
    if (OFICIO_PLACEHOLDER.test(nombreOficioFinal)) {
      const { mmdd, consecutivo } = await this.dailySequence.getNext();
      nombreOficioFinal = nombreOficioFinal.replace(
        OFICIO_PLACEHOLDER,
        `${mmdd}${consecutivo}`,
      );
    }

    // Inyectar idLote, tipoOficio MASIVO y nombreOficioFinal resuelto en cada fila
    for (const row of rows) {
      if (row.payload.oficio && typeof row.payload.oficio === 'object') {
        row.payload.oficio.idLote = loteId;
        row.payload.oficio.tipoOficio = tipoOficioMasivo;
        row.payload.oficio.nombreOficioFinal = nombreOficioFinal;
      }
    }

    // Persistir filas individuales en DB para trazabilidad
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

    // Paso 3 — Armar payloads por chunk (un envío por lote)
    const excelDestinationPath = this.configService.get<string>(
      'EXCEL_DESTINATION_PATH',
      '',
    );
    const rutaPdf = path.join(excelDestinationPath, path.basename(filePath));

    const firstPayload = rows[0].payload;
    const todosLosDemandados = rows
      .map((r) => (r.payload.demandados as any[])?.[0])
      .filter(Boolean);

    const chunks: any[][] = [];
    for (let i = 0; i < todosLosDemandados.length; i += loteSize) {
      chunks.push(todosLosDemandados.slice(i, i + loteSize));
    }

    const MAX_RETRIES = 3;
    const lotesPayloads: Record<string, any>[] = [];
    let enviados = 0;
    const filasFallidas: number[] = [];

    this.logger.log(
      `[3/4] Enviando ${chunks.length} lote(s) con hasta ${loteSize} demandados cada uno (loteId=${loteId}).`,
    );

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunkPayload: Record<string, any> = {
        oficio: {
          ...firstPayload.oficio,
          tipoOficio: tipoOficioMasivo,
          idLote: loteId,
          nombreOficioFinal,
          rutaPdf,
        },
        demandados: chunks[idx],
        demandantes: firstPayload.demandantes,
        ente: firstPayload.ente,
        infoCliente: firstPayload.infoCliente,
      };
      lotesPayloads.push(chunkPayload);

      const success = await this.sendBatchWithRetry(
        loteId,
        chunkPayload,
        MAX_RETRIES,
      );

      if (success) {
        enviados += chunks[idx].length;
      } else {
        const startFila = idx * loteSize + 1;
        for (let f = startFila; f < startFila + chunks[idx].length; f++) {
          filasFallidas.push(f);
        }
      }
    }

    const result: BatchResult = {
      loteId,
      enviados,
      fallidos: filasFallidas.length,
      filasFallidas,
      lotesEnviados: lotesPayloads,
    };

    this.logger.log(
      `[4/4] Batch finalizado. loteId=${loteId} enviados=${result.enviados} fallidos=${result.fallidos}`,
    );

    return result;
  }

  /**
   * Lee el workbook completo en memoria (no streaming) y detecta el tipo de
   * oficio (EMBARGO/DESEMBARGO/ALCANCE) a partir del nombre de la primera
   * hoja, mapeando cada fila al JSON final.
   *
   * Se usa el lector no-streaming porque `WorkbookReader` (streaming) solo
   * resuelve `xl/sharedStrings.xml` correctamente si ese archivo aparece
   * antes que las hojas dentro del .zip; cuando un .xlsx se reguarda con
   * Excel/LibreOffice el orden suele invertirse y todas las celdas de texto
   * llegan como referencias `{ sharedString: N }` sin resolver. Las
   * plantillas que procesa este flujo son pequeñas, por lo que cargarlas
   * completas en memoria es seguro.
   */
  private async parseWorkbook(filePath: string): Promise<{
    tipoOficio: string;
    rows: ParsedRow[];
  }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    const sheetName = worksheet?.name ?? '';
    const dataRows: any[][] = [];

    worksheet?.eachRow({ includeEmpty: true }, (row) => {
      // row.values es 1-indexado (índice 0 vacío); lo normalizamos a 0-indexado
      dataRows.push((row.values as any[]).slice(1));
    });

    const tipoOficio = this.resolveTipoOficio(sheetName, filePath);
    const fechaProcesamiento = new Date().toISOString();

    if (dataRows.length === 0) {
      return { tipoOficio, rows: [] };
    }

    // La primera fila puede ser un título ("PLANTILLA DE DILIGENCIAMIENTO — ...")
    // En ese caso, los encabezados están en la segunda fila y los datos desde la tercera.
    let headerIndex = 0;
    for (let r = 0; r < Math.min(dataRows.length, 3); r++) {
      const row = dataRows[r] || [];
      const firstNonEmpty = row.find(
        (c: unknown) => c !== undefined && c !== null && c !== '',
      );
      if (firstNonEmpty && TITLE_ROW_PATTERN.test(String(firstNonEmpty))) {
        headerIndex = r + 1;
        this.logger.debug(
          `[parseWorkbook] Fila título detectada en índice ${r}: "${String(firstNonEmpty).substring(0, 60)}"`,
        );
        break;
      }
    }

    const headers = dataRows[headerIndex] || [];
    this.logger.debug(
      `[parseWorkbook] headerIndex=${headerIndex}, headers (normalizados): ${headers
        .map((h: unknown) =>
          String(h ?? '')
            .trim()
            .substring(0, 30),
        )
        .join(' | ')}`,
    );
    const rows: ParsedRow[] = [];

    // Saltar filas descriptivas/ejemplo entre el header y los datos reales.
    const DESCRIPTION_ROW_PATTERN =
      /^(num[eé]rico|alfab[eé]tico|alfanum[eé]rico|sin puntos|caracteres|[A-Z]\s*\/\s*[A-Z]{1,3}\s*\/)/i;

    let dataStartIndex = headerIndex + 1;
    for (
      let i = headerIndex + 1;
      i < Math.min(dataRows.length, headerIndex + 4);
      i++
    ) {
      const row = dataRows[i] || [];
      const firstNonEmpty = row.find(
        (c: unknown) => c !== undefined && c !== null && c !== '',
      );
      if (
        firstNonEmpty &&
        DESCRIPTION_ROW_PATTERN.test(String(firstNonEmpty).trim())
      ) {
        this.logger.debug(
          `[parseWorkbook] Saltando fila descriptiva en índice ${i}: "${String(firstNonEmpty).substring(0, 50)}"`,
        );
        dataStartIndex = i + 1;
      } else {
        break;
      }
    }

    this.logger.debug(
      `[parseWorkbook] Datos reales comienzan en índice ${dataStartIndex}`,
    );

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

      rows.push({
        numeroFila: rows.length + 1,
        payload,
      });
    }

    return { tipoOficio, rows };
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

  private async sendBatchWithRetry(
    loteId: string,
    payload: Record<string, any>,
    maxRetries: number,
  ): Promise<boolean> {
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.debug(
        `[3/4] Enviando batch loteId=${loteId} (intento ${attempt}/${maxRetries})`,
      );
      try {
        const sent = await this.integrationService.sendData(
          payload,
          'EXCEL_BATCH',
        );
        if (sent) {
          this.logger.debug(
            `[3/4] Batch loteId=${loteId} enviado correctamente.`,
          );
          return true;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Batch loteId=${loteId} intento ${attempt}/${maxRetries} falló: ${message}`,
        );
      }

      if (attempt < maxRetries) {
        await this.sleep(RETRY_DELAY_MS * attempt);
      }
    }

    this.logger.error(
      `Batch loteId=${loteId} falló definitivamente tras ${maxRetries} intentos.`,
    );
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
