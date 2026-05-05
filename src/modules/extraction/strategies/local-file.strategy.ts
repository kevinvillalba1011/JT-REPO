import {
  FileExtractorStrategy,
  ExtractedFile,
} from './file-extractor.strategy';
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { DocumentRepository } from '../../documents/repositories/document.repository';

@Injectable()
export class LocalFileStrategy implements FileExtractorStrategy {
  private readonly logger = new Logger(LocalFileStrategy.name);
  private readonly sourcePaths: string[];
  private readonly processedFiles = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly documentRepository: DocumentRepository,
  ) {
    const paths = this.configService.get<string>(
      'LOCAL_SOURCE_PATHS',
      './local/ftp',
    );
    this.sourcePaths = paths.split(',').map((p) => p.trim());
  }

  async extractFiles(destinationFolder: string): Promise<ExtractedFile[]> {
    this.logger.log(
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
      await this.readDirectoryRecursive(
        sourcePath,
        allowedExtensions,
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

      const stat = fs.statSync(fullPath);
      const fileKey = `${fullPath}_${stat.mtimeMs}`;
      if (this.processedFiles.has(fileKey)) continue;

      // Check DB to avoid copying if it already exists
      const existingDoc = await this.documentRepository.findByFileName(
        file.name,
      );
      if (existingDoc) {
        this.logger.debug(
          `File ${file.name} already exists in DB. Skipping copy.`,
        );
        this.processedFiles.add(fileKey);
        continue;
      }

      // Use the original file name
      const uniqueName = file.name;
      const destinationPath = path.join(destinationFolder, uniqueName);

      try {
        fs.copyFileSync(fullPath, destinationPath);
        this.processedFiles.add(fileKey);
        this.logger.log(
          `Copied file ${fullPath} to ${destinationFolder} as ${uniqueName}`,
        );
        extractedFiles.push({
          name: uniqueName,
          originalPath: fullPath,
          destinationPath,
        });
      } catch (err) {
        this.logger.error(`Failed to copy file ${fullPath}: ${err.message}`);
      }
    }
  }
}
