import { plainToInstance } from 'class-transformer';
import {
  validateSync,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string;

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number;

  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

  @IsString()
  @IsNotEmpty()
  DOCUMENT_AI_PROCESSOR_ID: string;

  @IsString()
  @IsNotEmpty()
  GCP_PROJECT_ID: string;

  @IsString()
  @IsOptional()
  INTEGRATION_AUTH_URL?: string;

  @IsString()
  @IsOptional()
  INTEGRATION_AUTH_PAYLOAD?: string;

  @IsString()
  @IsOptional()
  INTEGRATION_DATA_URL?: string;

  @IsString()
  @IsOptional()
  INTEGRATION_BATCH_START_URL?: string;

  @IsNumber()
  @IsOptional()
  INTEGRATION_BATCH_CONCURRENCY?: number;

  @IsNumber()
  @IsOptional()
  INTEGRATION_LOTE_SIZE?: number;

  @IsString()
  @IsOptional()
  EXCEL_DESTINATION_PATH?: string;

  @IsString()
  @IsOptional()
  OCR_DESTINATION_PATH?: string;

  @IsString()
  @IsOptional()
  REPORTE_ENTRADA_PATH?: string;

  @IsString()
  @IsOptional()
  CRON_ENTRY_REPORT_SCHEDULE?: string;

  @IsNumber()
  @IsOptional()
  EXTRACTION_LOCK_TTL_SECONDS?: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Environment variables validation failed: ${errors.toString()}`,
    );
  }

  return validatedConfig;
}
