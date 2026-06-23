import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TenantProfile } from '../../modules/tenant/interfaces/tenant-profile.interface';

export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface GeminiExtractionResult {
  json: Record<string, unknown>;
  usage: GeminiUsage | null;
  modelUsed: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;

  private readonly fallbackChain: string[];

  constructor(
    private readonly configService: ConfigService,
    @Inject('TENANT_PROFILE') private readonly profile: TenantProfile,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);

    // Cargar cadena de modelos desde .env o usar por defecto
    const modelsConfig = this.configService.get<string>(
      'GEMINI_FALLBACK_MODELS',
    );
    if (modelsConfig) {
      this.fallbackChain = modelsConfig.split(',').map((m) => m.trim());
    } else {
      this.fallbackChain = [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-1.5-flash',
      ];
    }
    this.logger.log(
      `Gemini Fallback Chain initialized: ${this.fallbackChain.join(' -> ')}`,
    );
  }

  /**
   * Extrae los campos judiciales del texto o archivo usando Structured Outputs nativos
   */
  async extraerJudicial(
    text: string,
    fileBuffer?: Buffer,
    mimeType?: string,
  ): Promise<any> {
    const { json } = await this.generarExtraccion(text, fileBuffer, mimeType);
    return json;
  }

  /**
   * Igual que extraerJudicial pero además devuelve el uso de tokens y el modelo
   * efectivamente utilizado, para medir el costo real de una extracción
   * (usado por la ruta de prueba multimodal de PDF directo a Gemini).
   */
  async extraerJudicialConCosto(
    text: string,
    fileBuffer?: Buffer,
    mimeType?: string,
  ): Promise<GeminiExtractionResult> {
    return this.generarExtraccion(text, fileBuffer, mimeType);
  }

  private async generarExtraccion(
    text: string,
    fileBuffer?: Buffer,
    mimeType?: string,
  ): Promise<GeminiExtractionResult> {
    this.logger.verbose(
      'Starting data extraction via Gemini API with Structured Outputs',
    );

    const prompt = this.profile.promptTemplate.replace('{{text}}', text);
    let lastError: Error = new Error('No models available for extraction');

    for (const modelId of this.fallbackChain) {
      try {
        const timeoutMs = this.configService.get<number>(
          'GEMINI_TIMEOUT_MS',
          60000,
        );
        const model = this.genAI.getGenerativeModel(
          {
            model: modelId,
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: this.profile.responseSchema,
            },
          },
          { timeout: timeoutMs },
        );

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

        const usageMeta = result.response.usageMetadata;
        const usage: GeminiUsage | null = usageMeta
          ? {
              promptTokens: usageMeta.promptTokenCount ?? 0,
              outputTokens: usageMeta.candidatesTokenCount ?? 0,
              totalTokens: usageMeta.totalTokenCount ?? 0,
            }
          : null;
        if (usage) {
          this.logger.log(
            `[COSTO] modelo=${modelId} promptTokens=${usage.promptTokens} ` +
              `outputTokens=${usage.outputTokens} totalTokens=${usage.totalTokens}`,
          );
        }

        this.logger.debug(
          `Gemini Result multi-modal [via ${modelId}]: ${generatedText.substring(0, 100)}...`,
        );
        // Limpieza defensiva de markdown ```json ... ``` si se cuela
        const cleanedText = generatedText
          .replace(/^```(?:json)?/i, '')
          .replace(/```$/i, '')
          .trim();
        const resultJson = JSON.parse(cleanedText) as Record<string, unknown>;

        return { json: resultJson, usage, modelUsed: modelId };
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
