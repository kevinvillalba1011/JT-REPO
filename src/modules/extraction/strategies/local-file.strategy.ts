import {
  FileExtractorStrategy,
  ExtractedFile,
} from './file-extractor.strategy';
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

/**
 * Extensiones permitidas EXCLUSIVAMENTE para la carpeta "masivos"
 * (MASIVOS_SOURCE_PATH): un PDF/imagen dejado ahí no debe ser recogido por
 * el escaneo individual (OCR/Gemini) — debe quedar "en espera" hasta que el
 * Excel correspondiente lo reclame por nombre (ver `MassiveExcelService`).
 * Mismo set que ya usa `OcrProcessor` para detectar archivos de carga
 * masiva (`.xlsx/.xls/.csv`).
 */
const MASIVOS_ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

@Injectable()
export class LocalFileStrategy implements FileExtractorStrategy {
  private readonly logger = new Logger(LocalFileStrategy.name);
  private readonly sourcePaths: string[];
  private readonly masivosSourcePath: string;

  constructor(private readonly configService: ConfigService) {
    const paths = this.configService.get<string>(
      'LOCAL_SOURCE_PATHS',
      './local/source',
    );
    this.sourcePaths = paths.split(',').map((p) => p.trim());
    this.masivosSourcePath = this.configService.get<string>(
      'MASIVOS_SOURCE_PATH',
      '',
    );
  }

  async extractFiles(destinationFolder: string): Promise<ExtractedFile[]> {
    this.logger.verbose(
      `Scanning local folders recursively: ${this.sourcePaths.join(', ')}`,
    );
    const extractedFiles: ExtractedFile[] = [];
    const allowedExtensions = this.configService
      .get<string>('ALLOWED_EXTENSIONS', '')
      .split(',')
      .map((ext) => ext.trim().toLowerCase());

    for (const sourcePath of this.sourcePaths) {
      if (!fs.existsSync(sourcePath)) {
        this.logger.warn(`Source path does not exist: ${sourcePath}`);
        continue;
      }

      // La carpeta "masivos" tiene una lista de extensiones propia: solo
      // Excel/CSV. PDFs/imágenes ahí quedan reservados para que
      // MassiveExcelService los reclame por nombre, en vez de ser
      // procesados en paralelo por el flujo individual.
      const isMasivosFolder =
        !!this.masivosSourcePath &&
        path.resolve(sourcePath) === path.resolve(this.masivosSourcePath);
      const extensionsForThisFolder = isMasivosFolder
        ? MASIVOS_ALLOWED_EXTENSIONS
        : allowedExtensions;

      await this.readDirectoryRecursive(
        sourcePath,
        extensionsForThisFolder,
        extractedFiles,
        destinationFolder,
      );
    }

    return extractedFiles;
  }

  private async readDirectoryRecursive(
    currentDir: string,
    allowedExtensions: string[],
    extractedFiles: ExtractedFile[],
    destinationFolder: string,
  ) {
    if (!fs.existsSync(currentDir)) return;

    const files = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const file of files) {
      if (file.name.startsWith('.')) continue; // skip hidden files

      const fullPath = path.join(currentDir, file.name);

      if (file.isDirectory()) {
        await this.readDirectoryRecursive(
          fullPath,
          allowedExtensions,
          extractedFiles,
          destinationFolder,
        );
        continue;
      }

      // It's a file
      const ext = path.extname(file.name).toLowerCase();
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        this.logger.debug(
          `Skipping file ${file.name}: Extension ${ext} not allowed.`,
        );
        continue;
      }

      // Use the original file name
      const uniqueName = file.name;
      const destinationPath = path.join(destinationFolder, uniqueName);

      try {
        // Mover (no copiar) el archivo fuera de la carpeta fuente: si solo se
        // copia, el archivo original sigue existiendo ahí y el siguiente tick
        // del cron lo vuelve a recoger como si fuera nuevo, generando
        // registros y jobs duplicados indefinidamente.
        try {
          fs.renameSync(fullPath, destinationPath);
        } catch {
          fs.copyFileSync(fullPath, destinationPath);
          fs.unlinkSync(fullPath);
        }
        this.logger.log(
          `Moved file ${fullPath} to ${destinationFolder} as ${uniqueName}`,
        );
        extractedFiles.push({
          name: uniqueName,
          originalPath: fullPath,
          destinationPath,
        });
      } catch (err: any) {
        this.logger.error(`Failed to move file ${fullPath}: ${err.message}`);
      }
    }
  }
}
