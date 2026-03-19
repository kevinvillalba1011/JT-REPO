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
  private readonly fallbackChain: string[];

  constructor(
    private readonly configService: ConfigService,
    @Inject('TENANT_PROFILE') private readonly profile: TenantProfile,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not found. GeminiService might fail.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey || 'dummy-key');
    
    // Obtenemos los modelos desde Config, o usamos el fallback default
    const fallbackStr = this.configService.get<string>('GEMINI_FALLBACK_MODELS', 'gemini-2.5-flash,gemini-2.5-pro,gemini-2.0-flash');
    this.fallbackChain = fallbackStr.split(',').map((model) => model.trim());
  }

  /**
   * Extrae los campos judiciales del texto usando Structured Outputs nativos
   */
  async extraerJudicial(text: string): Promise<any> {
    this.logger.log('Starting data extraction via Gemini API with Structured Outputs');

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

        this.logger.log(`Intentando extracción de JSON con el modelo: ${modelId}...`);
        const result = await model.generateContent(prompt);
        const generatedText = result.response.text();
        
        this.logger.debug(`Gemini Result estructurado [via ${modelId}]: ${generatedText.substring(0, 100)}...`);
        return JSON.parse(generatedText);

      } catch (err) {
        lastError = err;
        const msg = err.message.toLowerCase();
        
        // Si es error de cuota individual (RPM/RPD/TPM) o sobrecarga del servidor de Google (503)
        // intentamos bypass usando un modelo alternativo del pool de Google (Fallback Routing)
        if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('503')) {
          this.logger.warn(`Modelo [${modelId}] sin cuota o congestionado. Disparando Fallback Automático al siguiente modelo...`);
          continue; 
        } else {
          // Si el error es de sintaxis, autenticación cruzada o error de validación, reventar el proceso inmediatamente
          throw err;
        }
      }
    }

    // Si terminamos de iterar la cadena entera, es porque quemamos toda la cuota diaria global de Models en el Tier.
    // Solo hasta este punto soltamos la bomba hacia arriba (BullMQ) para que espere en frío usando Backoff Exponencial severo.
    this.logger.error('CRÍTICO: Agotamiento Global de Modelos. Se quemaron los Rate Limits en toda la cadena de Fallback.');
    throw lastError;
  }
}
