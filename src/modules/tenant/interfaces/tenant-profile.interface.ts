import { Schema } from '@google/generative-ai';

export interface TenantProfile {
  id: string;
  promptTemplate: string;
  responseSchema: Schema;
  clientFields: string[];
  nonClientFields: string[];
  identifierKey: string;
  /** Tope de caracteres de demandados[].numeroId. Default 30 si no se define. */
  numeroIdDemandadoMaxLength?: number;
}
