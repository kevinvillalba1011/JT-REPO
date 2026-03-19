import { Schema } from '@google/generative-ai';

export interface TenantProfile {
  id: string;
  promptTemplate: string;
  responseSchema: Schema;
  clientFields: string[];
  nonClientFields: string[];
  identifierKey: string;
}
