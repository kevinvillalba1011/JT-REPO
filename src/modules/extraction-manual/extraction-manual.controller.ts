import { createHash } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Logger,
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
import { DocumentState } from '@prisma/client';
import { GeminiService } from '../../common/services/gemini.service';
import { DocumentRepository } from '../documents/repositories/document.repository';

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
  private readonly logger = new Logger(ExtractionManualController.name);

  constructor(
    private readonly geminiService: GeminiService,
    private readonly configService: ConfigService,
    private readonly documentRepository: DocumentRepository,
  ) {}

  /**
   * Extraccion SINCRONA y a demanda de un PDF: usada por el boton
   * "Rellenar datos" del portal B2B legado (EmbargosWebJTC / JBoss). Envia
   * el PDF directo a Gemini (mismo camino multimodal del pipeline
   * principal) y devuelve el JSON con el TenantProfile activo
   * (TENANT_PROFILE=bbva, repurpuesto para este caso - ver
   * .agents/decisions.md).
   *
   * Distinta del pipeline batch: no pasa por colas ni por Document AI ni por
   * la cola. El resultado SI queda guardado en "documents" (json_modelo),
   * con estado MANUAL_OK (no IA_OK: asi no entra al reporte diario ni a las
   * metricas del flujo batch); si ese guardado falla, solo se registra en el
   * log y la respuesta al portal no se afecta. El portal sigue decidiendo que hacer
   * con la respuesta (prellenar el formulario, dejar que el operador
   * corrija y guarde como siempre).
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
      properties: {
        file: { type: 'string', format: 'binary' },
        label: { type: 'string', description: 'Label del embargo (opcional)' },
        usuario: { type: 'string', description: 'Usuario del portal (opcional)' },
        forzar: {
          type: 'string',
          description:
            '"true" = ignora el resultado guardado de este PDF y consulta a Gemini de nuevo',
        },
      },
    },
  })
  async extraerManual(
    @UploadedFile() file: UploadedPdf | undefined,
    @Headers('x-api-key') apiKey: string | undefined,
    @Body()
    body: { label?: string; usuario?: string; forzar?: string } | undefined,
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

    // Si este mismo PDF (por MD5) ya se extrajo, se devuelve lo guardado y no
    // se vuelve a pagar Gemini, salvo que el portal pida forzar (boton
    // "Reintentar IA"). Cualquier fallo del cache se ignora y se extrae normal.
    const md5Hash = createHash('md5').update(file.buffer).digest('hex');
    if (body?.forzar !== 'true') {
      try {
        const previo = await this.documentRepository.findManualOkByHash(md5Hash);
        if (previo?.jsonModel && typeof previo.jsonModel === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _origen, ...resultado } = previo.jsonModel as Record<
            string,
            unknown
          >;
          return {
            archivo: file.originalname,
            resultado,
            desdeCache: true,
          };
        }
      } catch (e) {
        this.logger.warn(
          `No se pudo consultar el cache de extracciones manuales: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const mimeType = file.mimetype || 'application/pdf';
    const json = await this.geminiService.extraerJudicial(
      '(El contenido a procesar esta en el documento adjunto.)',
      file.buffer,
      mimeType,
    );
    await this.guardar(file, body, md5Hash, json);

    return {
      archivo: file.originalname,
      resultado: json,
    };
  }

  /**
   * Guarda la extraccion en "documents"; nunca lanza (el portal no debe
   * fallar por esto). El label y el usuario del portal van en `_origen`
   * dentro de json_modelo, porque "documents" no tiene columnas para ellos.
   */
  private async guardar(
    file: UploadedPdf,
    body: { label?: string; usuario?: string } | undefined,
    md5Hash: string,
    resultado: unknown,
  ): Promise<void> {
    try {
      const json =
        resultado && typeof resultado === 'object' ? resultado : {};
      await this.documentRepository.create({
        fileName: file.originalname,
        md5Hash,
        state: DocumentState.MANUAL_OK,
        jsonModel: {
          ...json,
          _origen: {
            fuente: 'extraction-manual',
            label: body?.label?.trim() || null,
            usuario: body?.usuario?.trim() || null,
          },
        },
      });
    } catch (e) {
      this.logger.warn(
        `No se pudo guardar la extraccion manual de ${file.originalname}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
