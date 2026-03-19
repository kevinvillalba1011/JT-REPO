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
    this.logger.log(`Scanning local folder recursively: ${this.sourcePath}`);
    const extractedFiles: ExtractedFile[] = [];
    const allowedExtensions = this.configService.get<string>('ALLOWED_EXTENSIONS', '').split(',').map(ext => ext.trim().toLowerCase());

    this.readDirectoryRecursive(this.sourcePath, allowedExtensions, extractedFiles, destinationFolder);

    return extractedFiles;
  }

  private readDirectoryRecursive(currentDir: string, allowedExtensions: string[], extractedFiles: ExtractedFile[], destinationFolder: string) {
    if (!fs.existsSync(currentDir)) return;

    const files = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const file of files) {
      if (file.name.startsWith('.')) continue; // skip hidden files

      const fullPath = path.join(currentDir, file.name);

      if (file.isDirectory()) {
        this.readDirectoryRecursive(fullPath, allowedExtensions, extractedFiles, destinationFolder);
        continue;
      }

      // It's a file
      const ext = path.extname(file.name).toLowerCase();
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        this.logger.debug(`Skipping file ${file.name}: Extension ${ext} not allowed.`);
        continue;
      }

      // Generate a collision-free destination name just in case two files in different folders share the same name
      const uniqueName = Date.now().toString() + '_' + file.name;
      const destinationPath = path.join(destinationFolder, uniqueName);

      try {
        fs.renameSync(fullPath, destinationPath);
        this.logger.log(`Moved file ${fullPath} to ${destinationFolder} as ${uniqueName}`);
        extractedFiles.push({
          name: uniqueName,
          originalPath: fullPath,
          destinationPath,
        });
      } catch (err) {
        this.logger.error(`Failed to move file ${fullPath}: ${err.message}`);
      }
    }
  }
}
