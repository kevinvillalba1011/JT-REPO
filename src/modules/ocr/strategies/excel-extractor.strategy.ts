import { Injectable, Logger } from '@nestjs/common';
import * as xlsx from 'xlsx';
import { TextExtractorStrategy } from './text-extractor.strategy';

@Injectable()
export class ExcelExtractorStrategy implements TextExtractorStrategy {
  private readonly logger = new Logger(ExcelExtractorStrategy.name);

  canHandle(fileExt: string): boolean {
    return ['.xls', '.xlsx', '.csv'].includes(fileExt.toLowerCase());
  }

  async extractText(filePath: string): Promise<string> {
    this.logger.log(`Extracting text from Excel/CSV locally without Document AI: ${filePath}`);
    const workbook = xlsx.readFile(filePath);
    let extractedText = '';
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csvStr = xlsx.utils.sheet_to_csv(sheet);
      extractedText += `--- HOJA: ${sheetName} ---\n${csvStr}\n\n`;
    }
    
    if (!extractedText.trim()) throw new Error('El archivo Excel se encuentra vacío o es ilegible.');

    return extractedText;
  }
}
