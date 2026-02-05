import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const docai = require('@google-cloud/documentai').v1;

@Injectable()
export class DocumentAiService {
  private client: InstanceType<typeof docai.DocumentProcessorServiceClient>;
  private processorName: string;

  constructor(private readonly config: ConfigService) {
    const projectId = this.config.get<string>('GCP_PROJECT_ID');
    const location = this.config.get<string>('GCP_LOCATION', 'us');
    const processorId = this.config.get<string>('DOCUMENT_AI_PROCESSOR_ID');

    if (!projectId || !processorId) {
      throw new Error(
        'GCP_PROJECT_ID y DOCUMENT_AI_PROCESSOR_ID son requeridos para Document AI',
      );
    }

    this.processorName = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    this.client = new docai.DocumentProcessorServiceClient({
      apiEndpoint: `${location}-documentai.googleapis.com`,
    });
  }

  /**
   * Envía el archivo a Document AI (OCR) y devuelve el texto extraído.
   */
  async extractTextFromFile(file: Express.Multer.File): Promise<string> {
    const contentBase64 = file.buffer.toString('base64');
    const [result] = await this.client.processDocument({
      name: this.processorName,
      rawDocument: {
        content: contentBase64,
        mimeType: file.mimetype || 'application/pdf',
      },
    });

    const document = result.document;
    if (!document?.text) {
      return '';
    }
    return document.text;
  }
}
