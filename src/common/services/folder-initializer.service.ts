import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FolderInitializerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FolderInitializerService.name);

  constructor(private readonly configService: ConfigService) {}

  onApplicationBootstrap() {
    const folders = [
      // Internal Pipeline Paths
      path.resolve(
        process.cwd(),
        this.configService.get<string>('IN_PATH', './local/in'),
      ),
      path.resolve(
        process.cwd(),
        this.configService.get<string>('OCR_PATH', './local/ocr'),
      ),
      path.resolve(
        process.cwd(),
        this.configService.get<string>(
          'EXCEL_DESTINATION_PATH',
          './local/excel-done',
        ),
      ),
      path.resolve(
        process.cwd(),
        this.configService.get<string>(
          'OCR_DESTINATION_PATH',
          './local/ocr-done',
        ),
      ),
      path.resolve(
        process.cwd(),
        this.configService.get<string>(
          'REPORTE_ENTRADA_PATH',
          './local/reporte_entrada',
        ),
      ),

      // Local source/data paths
      ...this.configService
        .get<string>('LOCAL_SOURCE_PATHS', './local/source')
        .split(',')
        .map((p) => path.resolve(process.cwd(), p.trim())),
      path.resolve(
        process.cwd(),
        this.configService.get<string>('LOCAL_CLIENTS_PATH', './local/data'),
      ),
      path.resolve(
        process.cwd(),
        this.configService.get<string>('LOCAL_REPORTS_PATH', './local/reports'),
      ),

      path.resolve(process.cwd(), './secrets'),
    ];

    this.logger.log('Validating system folders...');

    folders.forEach((folder) => {
      if (!fs.existsSync(folder)) {
        this.logger.log(`Creating folder: ${folder}`);
        fs.mkdirSync(folder, { recursive: true });
      }
    });

    this.logger.log('Folder validation complete.');
  }
}
