import {
  FileExtractorStrategy,
  ExtractedFile,
} from './file-extractor.strategy';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { Client } from 'basic-ftp';

@Injectable()
export class FtpFileStrategy implements FileExtractorStrategy {
  private readonly logger = new Logger(FtpFileStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  async extractFiles(destinationFolder: string): Promise<ExtractedFile[]> {
    const host = this.configService.get<string>('FTP_HOST');
    const user = this.configService.get<string>('FTP_USER');
    const password = this.configService.get<string>('FTP_PASSWORD');
    const port = this.configService.get<number>('FTP_PORT', 21);
    const remotePath = this.configService.get<string>('FTP_REMOTE_PATH', '/');

    if (!host || !user || !password) {
      this.logger.warn('FTP credentials missing. Skipping extraction.');
      return [];
    }

    const client = new Client();
    client.ftp.verbose = true; // Activamos logs detallados para ver la comunicación FTP
    const extractedFiles: ExtractedFile[] = [];

    try {
      await client.access({
        host,
        user,
        password,
        port,
        secure: false,
      });

      // this.logger.log(`Connected to FTP: ${host}`);

      // Cambiamos al directorio remoto primero para asegurar rutas correctas
      await client.cd(remotePath);
      const allowedExtensions = this.configService
        .get<string>('ALLOWED_EXTENSIONS', '')
        .split(',')
        .map((ext) => ext.trim().toLowerCase());

      await this.readFtpDirectoryRecursive(
        client,
        remotePath,
        destinationFolder,
        allowedExtensions,
        extractedFiles,
      );
    } catch (err) {
      this.logger.error(`FTP Error: ${err.message}`);
    } finally {
      client.close();
    }

    return extractedFiles;
  }

  private async readFtpDirectoryRecursive(
    client: Client,
    currentPath: string,
    destinationFolder: string,
    allowedExtensions: string[],
    extractedFiles: ExtractedFile[],
  ) {
    await client.cd(currentPath);
    const fileList = await client.list();

    for (const file of fileList) {
      if (file.isDirectory) {
        // recursively enter
        const nextPath = path.posix.join(currentPath, file.name);
        await this.readFtpDirectoryRecursive(
          client,
          nextPath,
          destinationFolder,
          allowedExtensions,
          extractedFiles,
        );
        // Ensure we are back in the correct directory after returning
        await client.cd(currentPath);
        continue;
      }

      const ext = path.extname(file.name).toLowerCase();
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        continue;
      }

      // Generate a collision-free destination name just in case
      const uniqueName = Date.now().toString() + '_' + file.name;
      const localFilePath = path.join(destinationFolder, uniqueName);

      this.logger.log(
        `Downloading FTP file ${file.name} from ${currentPath} to ${localFilePath}`,
      );

      await client.downloadTo(localFilePath, file.name);

      extractedFiles.push({
        name: uniqueName,
        originalPath: path.posix.join(currentPath, file.name),
        destinationPath: localFilePath,
      });
    }
  }
}
