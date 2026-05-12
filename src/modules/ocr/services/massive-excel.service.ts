import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import { PrismaService } from '@/common/prisma/prisma.service';

@Injectable()
export class MassiveExcelService {
  private readonly logger = new Logger(MassiveExcelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async process(filePath: string, fileName: string): Promise<number> {
    this.logger.log(`Iniciando procesamiento de Excel masivo: ${fileName}`);

    // Limpiar registros previos del mismo archivo para evitar duplicados si es un reintento
    await this.prisma.excelRecord.deleteMany({
      where: { excelName: fileName },
    });

    const ext = path.extname(fileName).toLowerCase();
    let totalInserted = 0;

    // exceljs Stream Reader solo funciona con archivos .xlsx (OpenXML)
    // Para .xls (legacy) y .csv usamos la lectura estándar ya que suelen ser más pequeños
    if (ext === '.xlsx') {
      const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
        worksheets: 'emit',
      });

      let batch: any[] = [];
      const BATCH_SIZE = 500;

      for await (const worksheetReader of workbookReader) {
        for await (const row of worksheetReader) {
          if (row.number === 1) continue;
          const values = row.values as any[];
          this.pushToBatch(batch, values, fileName);

          if (batch.length >= BATCH_SIZE) {
            await this.prisma.excelRecord.createMany({ data: batch });
            totalInserted += batch.length;
            batch = [];
          }
        }
      }
      if (batch.length > 0) {
        await this.prisma.excelRecord.createMany({ data: batch });
        totalInserted += batch.length;
      }
    } else {
      // Manejo para .xls y .csv usando la librería 'xlsx' (más robusta para formatos antiguos)
      const workbook = xlsx.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Convertir a JSON (array de arrays) para procesar
      const data = xlsx.utils.sheet_to_json(worksheet, {
        header: 1,
      });
      const batch: any[] = [];

      // Empezamos en i = 1 para saltar el encabezado
      for (let i = 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        // Mapeo de columnas (xlsx usa índices base 0)
        this.pushToBatch(batch, [null, ...row], fileName); // Añadimos null al inicio para que pushToBatch use índices 1-8
      }

      if (batch.length > 0) {
        await this.prisma.excelRecord.createMany({ data: batch });
        totalInserted += batch.length;
      }
    }

    this.logger.log(
      `Excel masivo ${fileName} procesado exitosamente. Total registros: ${totalInserted}`,
    );
    return totalInserted;
  }

  private pushToBatch(batch: any[], values: any[], fileName: string) {
    const consecutivo = values[1] ? Number(values[1]) : null;
    const nroOficio = values[2]?.toString() || null;
    const resolucion1 = values[3]?.toString() || null;
    const resolucion2 = values[4]?.toString() || null;
    const resolucion3 = values[5]?.toString() || null;
    const resolucion4 = values[6]?.toString() || null;
    const idDemandado = values[7]?.toString() || null;
    const nombre = values[8]?.toString() || null;

    batch.push({
      excelName: fileName,
      consecutivo: isNaN(consecutivo as number) ? null : consecutivo,
      nroOficio,
      resolucion1,
      resolucion2,
      resolucion3,
      resolucion4,
      idDemandado,
      nombre,
    });
  }
}
