export interface ReportStrategy {
  saveReport(fileName: string, content: string): Promise<void>;
}
