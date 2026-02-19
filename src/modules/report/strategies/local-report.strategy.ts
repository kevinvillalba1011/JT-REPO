import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReportStrategy } from './report.strategy';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LocalReportStrategy implements ReportStrategy {
  private readonly logger = new Logger(LocalReportStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  async saveReport(fileName: string, content: string): Promise<void> {
    const reportOutputPath = this.configService.get<string>('LOCAL_REPORTS_PATH', './local/reports');
    const fullPath = path.join(reportOutputPath, fileName);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content);
    this.logger.log(`Report saved locally at ${fullPath}`);
  }
}
