import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import * as fs from 'fs';
import { TextExtractorStrategy } from './text-extractor.strategy';

@Injectable()
export class DocumentAiStrategy implements TextExtractorStrategy {
  private readonly docAiClient: DocumentProcessorServiceClient;
  private readonly logger = new Logger(DocumentAiStrategy.name);

  constructor(private readonly configService: ConfigService) {
    this.docAiClient = new DocumentProcessorServiceClient();
  }

  canHandle(fileExt: string): boolean {
    return ['.pdf', '.jpg', '.jpeg', '.png', '.tiff'].includes(
      fileExt.toLowerCase(),
    );
  }

  async extractText(filePath: string): Promise<string> {
    const fileBuffer = fs.readFileSync(filePath);
    const encodedImage = fileBuffer.toString('base64');

    const projectId = this.configService.get<string>('GCP_PROJECT_ID');
    const location = this.configService.get<string>('GCP_LOCATION', 'us');
    const processorId = this.configService.get<string>(
      'DOCUMENT_AI_PROCESSOR_ID',
    );

    if (!projectId || !processorId) {
      throw new Error('GCP Configuration missing for Document AI');
    }

    const resourceName = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    let mimeType = 'application/pdf';
    const fileNameLower = filePath.toLowerCase();

    if (fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg'))
      mimeType = 'image/jpeg';
    else if (fileNameLower.endsWith('.png')) mimeType = 'image/png';
    else if (fileNameLower.endsWith('.tiff')) mimeType = 'image/tiff';

    const request = {
      name: resourceName,
      rawDocument: {
        content: encodedImage,
        mimeType,
      },
    };

    this.logger.log(`Calling Document AI: ${resourceName}`);
    const [result] = await this.docAiClient.processDocument(request);

    const { document } = result;
    return document?.text || '';
  }
}
