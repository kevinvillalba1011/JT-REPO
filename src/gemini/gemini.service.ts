import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-2.5-flash-lite';

@Injectable()
export class GeminiService {
  private ai: GoogleGenAI;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY es requerido');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Clasificación: determina si el contenido indica que es cliente (o dato para saber si es cliente).
   */
  async clasificar(texto: string): Promise<{ esCliente: boolean; razon?: string }> {
    const prompt = `Eres un clasificador. Dado el siguiente texto extraído de un documento, determina si corresponde a un CLIENTE (persona o entidad que es cliente de la organización) o no.
Responde ÚNICAMENTE con un JSON válido con esta forma: { "esCliente": true o false, "razon": "breve explicación" }
No agregues texto fuera del JSON.

TEXTO:
${texto}`;

    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    const raw = response.text?.trim() ?? '';
    const json = this.parseJson(raw) as { esCliente?: boolean; razon?: string };
    return {
      esCliente: Boolean(json?.esCliente),
      razon: typeof json?.razon === 'string' ? json.razon : undefined,
    };
  }

  /**
   * Extracción: extrae datos estructurados del texto (entidades, números, fechas, etc.).
   */
  async extraer(texto: string): Promise<Record<string, unknown>> {
    const prompt = `Eres un extractor de datos. Del siguiente texto extrae la información relevante en formato JSON.
Incluye campos como: nombres, identificaciones, fechas, montos, entidades, radicados, tipo de documento, etc. Usa claves en español.
Si un dato no aparece, no lo inventes; omite la clave o usa null.
Responde ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto adicional.

TEXTO:
${texto}`;

    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    const raw = response.text?.trim() ?? '';
    const parsed = this.parseJson(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  }

  private parseJson(raw: string): unknown {
    let str = raw.trim();
    const codeBlock = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(str);
    if (codeBlock) str = codeBlock[1].trim();
    return JSON.parse(str);
  }
}
