import { Logger } from '@nestjs/common';

export interface ExtractedFile {
  name: string;
  originalPath: string; // or identifier
  destinationPath: string; // where it was downloaded/moved to
}

export interface FileExtractorStrategy {
  extractFiles(destinationFolder: string): Promise<ExtractedFile[]>;
}
