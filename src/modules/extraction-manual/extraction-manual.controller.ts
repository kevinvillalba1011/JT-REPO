import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GeminiService } from '../../common/services/gemini.service';

/** Forma minima del archivo subido via multer (memory storage). */
interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('extraction-manual')
@Controller('extraction')
export class ExtractionManualController {
  constructor(
    private readonly geminiService: GeminiService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Extraccion SINCRONA y a demanda de un PDF: usada por el boton
   * "Rellenar datos" del portal B2B legado (EmbargosWebJTC / JBoss). Envia
   * el PDF directo a Gemini (mismo camino multimodal del pipeline
   * principal) y devuelve el JSON con el TenantProfile activo
   * (TENANT_PROFILE=bbva, repurpuesto para este caso - ver
   * .agents/decisions.md).
   *
   * Distinta del pipeline batch: no toca la base de datos, no pasa por
   * colas ni por Document AI, y el resultado no se persiste aqui - el
   * portal es quien decide que hacer con la respuesta (prellenar el
   * formulario, dejar que el operador corrija y guarde como siempre).
   *
   * Protegida con un header simple de API key (EXTRACTION_MANUAL_API_KEY)
   * porque se llama desde la red interna, no queda expuesta publicamente.
   * Si la variable de entorno no esta configurada, no se exige el header
   * (comodo para desarrollo local, pero debe configurarse antes de
   * exponer este endpoint fuera de una red confiable).
   */
  @Post('manual')
  @ApiOperation({
    summary:
      'Extraccion a demanda de un PDF (boton "Rellenar datos" del portal B2B). Requiere header X-Api-Key si EXTRACTION_MANUAL_API_KEY esta configurada.',
  })
  @ApiHeader({ name: 'X-Api-Key', required: false })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async extraerManual(
    @UploadedFile() file: UploadedPdf | undefined,
    @Headers('x-api-key') apiKey: string | undefined,
  ) {
    const expectedKey = this.configService.get<string>(
      'EXTRACTION_MANUAL_API_KEY',
    );
    if (expectedKey && apiKey !== expectedKey) {
      throw new UnauthorizedException('X-Api-Key invalida o ausente.');
    }

    if (!file || !file.buffer) {
      throw new BadRequestException(
        'Adjunta un archivo PDF en el campo de formulario "file".',
      );
    }

    const mimeType = file.mimetype || 'application/pdf';
    const json = await this.geminiService.extraerJudicial(
      '(El contenido a procesar esta en el documento adjunto.)',
      file.buffer,
      mimeType,
    );

    return {
      archivo: file.originalname,
      resultado: json,
    };
  }
}
