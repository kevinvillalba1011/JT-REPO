import { Injectable, Logger } from '@nestjs/common';
import { ReportStrategy } from './report.strategy';

@Injectable()
export class GmailReportStrategy implements ReportStrategy {
  private readonly logger = new Logger(GmailReportStrategy.name);

  async saveReport(fileName: string, content: string): Promise<void> {
    this.logger.log(`Gmail Report Mode: Simulating email send for ${fileName}`);
    // Future: Use nodemailer or similar
  }
}
