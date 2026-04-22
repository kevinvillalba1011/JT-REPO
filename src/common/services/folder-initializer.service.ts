import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

@Injectable()
export class FolderInitializerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FolderInitializerService.name);

  constructor(private readonly configService: ConfigService) {}

  onApplicationBootstrap() {
    const folders = [
      // Internal Pipeline Paths
      this.configService.get<string>('IN_PATH', './local/in'),
      this.configService.get<string>('OCR_PATH', './local/ocr'),
      this.configService.get<string>('DONE_PATH', './local/done'),

      // Mode-specific Local Paths
      this.configService.get<string>('LOCAL_SOURCE_PATH', './local/ftp'),
      this.configService.get<string>('LOCAL_CLIENTS_PATH', './local/data'),
      this.configService.get<string>('LOCAL_REPORTS_PATH', './local/reports'),

      './ftp', // FTP root for Docker
      './secrets',
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
