import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GeminiService } from '../../common/services/gemini.service';

/** Forma mínima del archivo subido vía multer (memory storage). */
interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('test')
@Controller('test')
export class TestController {
  constructor(
    private readonly geminiService: GeminiService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * RUTA DE PRUEBA (no productiva): envía un PDF directamente a Gemini
   * (multimodal), SIN pasar por Document AI, y devuelve el JSON extraído junto
   * con el uso de tokens y un costo estimado. Sirve para evaluar precisión y
   * costo del enfoque "PDF directo" antes de decidir migrar el pipeline y
   * liberarse de Document AI. Usa el TenantProfile activo (TENANT_PROFILE).
   */
  @Post('gemini-pdf')
  @ApiOperation({
    summary:
      'Prueba: PDF directo a Gemini (sin Document AI). Devuelve JSON + tokens + costo estimado.',
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async geminiPdf(@UploadedFile() file?: UploadedPdf) {
    if (!file || !file.buffer) {
      throw new BadRequestException(
        'Adjunta un archivo PDF en el campo de formulario "file".',
      );
    }

    const mimeType = file.mimetype || 'application/pdf';
    const { json, usage, modelUsed } =
      await this.geminiService.extraerJudicialConCosto(
        '(El contenido a procesar está en el PDF adjunto.)',
        file.buffer,
        mimeType,
      );

    // Tarifas configurables (USD por 1M de tokens). Defaults orientativos de
    // Gemini 2.5 Flash; ajusta GEMINI_PRICE_* en el .env para igualar tu medición.
    const inputRate = Number(
      this.configService.get<string>('GEMINI_PRICE_INPUT_PER_1M', '0.30'),
    );
    const outputRate = Number(
      this.configService.get<string>('GEMINI_PRICE_OUTPUT_PER_1M', '2.50'),
    );

    const inputTokens = usage?.promptTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const costoEstimadoUSD =
      (inputTokens / 1_000_000) * inputRate +
      (outputTokens / 1_000_000) * outputRate;

    return {
      archivo: file.originalname,
      tamanoBytes: file.size,
      modelUsed,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: usage?.totalTokens ?? 0,
      },
      ratesUSDpor1M: { input: inputRate, output: outputRate },
      costoEstimadoUSD: Number(costoEstimadoUSD.toFixed(6)),
      resultado: json,
    };
  }
}
