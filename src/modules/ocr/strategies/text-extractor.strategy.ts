export interface TextExtractorStrategy {
  extractText(filePath: string): Promise<string>;
  canHandle(fileExt: string): boolean;
}
