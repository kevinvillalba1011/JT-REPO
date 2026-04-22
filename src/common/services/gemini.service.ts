import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TenantProfile } from '../../modules/tenant/interfaces/tenant-profile.interface';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;

  // Modelos ordenados por prelación. Si uno falla por cuota individual (RPM/TPM),
  // el Cascade Fallback saltará al siguiente que tiene pools de cuota independientes.
  private readonly fallbackChain = [
    'gemini-2.0-flash-exp', // Alta prioridad / Experimental
    'gemini-1.5-flash', // Estándar / Rápido
    'gemini-1.5-pro', // Alta calidad / Fallback seguro
  ];

  constructor(
    private readonly configService: ConfigService,
    @Inject('TENANT_PROFILE') private readonly profile: TenantProfile,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Extrae los campos judiciales del texto o archivo usando Structured Outputs nativos
   */
  async extraerJudicial(
    text: string,
    fileBuffer?: Buffer,
    mimeType?: string,
  ): Promise<any> {
    this.logger.log(
      'Starting data extraction via Gemini API with Structured Outputs',
    );

    const prompt = this.profile.promptTemplate.replace('{{text}}', text);
    let lastError: Error = new Error('No models available for extraction');

    for (const modelId of this.fallbackChain) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelId,
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: this.profile.responseSchema,
          },
        });

        this.logger.log(
          `Intentando extracción de JSON con el modelo: ${modelId}...`,
        );

        const parts: any[] = [{ text: prompt }];

        if (fileBuffer && mimeType) {
          parts.push({
            inlineData: {
              data: fileBuffer.toString('base64'),
              mimeType: mimeType,
            },
          });
        }

        const result = await model.generateContent(parts);
        const generatedText = result.response.text();

        this.logger.debug(
          `Gemini Result multi-modal [via ${modelId}]: ${generatedText.substring(0, 100)}...`,
        );
        const resultJson = JSON.parse(generatedText);

        // Reordenar las claves del JSON (Garantía de orden del Excel)
        const orderedJson = {};
        this.profile.clientFields.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(resultJson, key)) {
            orderedJson[key] = resultJson[key];
          } else {
            orderedJson[key] = '';
          }
        });

        return orderedJson;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Error con modelo ${modelId}: ${errMsg}. Intentando fallback...`,
        );
      }
    }

    this.logger.error(
      'CRÍTICO: Agotamiento Global de Modelos. Se quemaron los Rate Limits en toda la cadena de Fallback.',
    );
    throw lastError;
  }
}
