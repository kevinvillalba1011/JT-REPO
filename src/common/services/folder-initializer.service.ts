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

      // Local source/data paths — 4 carpetas fijas, mismo nombre de
      // variable en local y en producción (ver LocalFileStrategy).
      path.resolve(
        process.cwd(),
        this.configService.get<string>('SOURCE_PATH_1', './local/source1'),
      ),
      path.resolve(
        process.cwd(),
        this.configService.get<string>('SOURCE_PATH_2', './local/source2'),
      ),
      path.resolve(
        process.cwd(),
        this.configService.get<string>('SOURCE_PATH_3', './local/source3'),
      ),
      path.resolve(
        process.cwd(),
        this.configService.get<string>(
          'SOURCE_PATH_MASIVOS',
          './local/masivos',
        ),
      ),
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
