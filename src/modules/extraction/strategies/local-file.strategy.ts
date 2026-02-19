import { FileExtractorStrategy, ExtractedFile } from './file-extractor.strategy';
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LocalFileStrategy implements FileExtractorStrategy {
  private readonly logger = new Logger(LocalFileStrategy.name);
  private readonly sourcePath: string;

  constructor(private readonly configService: ConfigService) {
    this.sourcePath = this.configService.get<string>('LOCAL_SOURCE_PATH', './local/ftp');
  }

  async extractFiles(destinationFolder: string): Promise<ExtractedFile[]> {
    this.logger.log(`Scanning local folder: ${this.sourcePath}`);
    const files = fs.readdirSync(this.sourcePath);
    const extractedFiles: ExtractedFile[] = [];

    const allowedExtensions = this.configService.get<string>('ALLOWED_EXTENSIONS', '').split(',').map(ext => ext.trim().toLowerCase());

    for (const file of files) {
      if (file.startsWith('.')) continue; // skip hidden files

      const ext = path.extname(file).toLowerCase();
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        this.logger.debug(`Skipping file ${file}: Extension ${ext} not allowed.`);
        continue;
      }
      const originalPath = path.join(this.sourcePath, file);
      const destinationPath = path.join(destinationFolder, file);

      try {
        fs.renameSync(originalPath, destinationPath);
        this.logger.log(`Moved file ${file} to ${destinationFolder}`);
        extractedFiles.push({
          name: file,
          originalPath,
          destinationPath,
        });
      } catch (err) {
        this.logger.error(`Failed to move file ${file}: ${err.message}`);
      }
    }

    return extractedFiles;
  }
}
