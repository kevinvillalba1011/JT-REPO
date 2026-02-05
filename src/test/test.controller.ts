import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
  ApiProperty,
} from '@nestjs/swagger';
import { DocumentAiService } from '../document-ai/document-ai.service';
import { GeminiService } from '../gemini/gemini.service';

export class TextDto {
  @ApiProperty({
    description: 'Texto a clasificar o del cual extraer datos',
    example: 'Documento de embargo a nombre de Juan Pérez, CC 1020304050...',
  })
  text: string;
}

@ApiTags('test')
@Controller('test')
export class TestController {
  constructor(
    private readonly documentAi: DocumentAiService,
    private readonly gemini: GeminiService,
  ) {}

  @Post('ocr')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Probar OCR',
    description: 'Sube un archivo (PDF/imagen). Google Document AI devuelve el texto extraído (OCR).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Documento a procesar' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 200, description: 'Texto OCR devuelto por Document AI' })
  @ApiResponse({ status: 400, description: 'No se envió archivo' })
  @ApiResponse({ status: 500, description: 'Error de Document AI' })
  async ocr(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No se proporcionó ningún archivo', HttpStatus.BAD_REQUEST);
    }
    try {
      const text = await this.documentAi.extractTextFromFile(file);
      return { success: true, text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpException(`Error Document AI: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('clasificacion')
  @ApiOperation({
    summary: 'Probar clasificación',
    description: 'Envía texto; Gemini 2.5 Flash Lite indica si es cliente (dato para saber si es cliente).',
  })
  @ApiBody({ type: TextDto })
  @ApiResponse({ status: 200, description: 'Resultado: esCliente y razón' })
  @ApiResponse({ status: 400, description: 'Texto vacío' })
  @ApiResponse({ status: 500, description: 'Error de Gemini' })
  async clasificacion(@Body() dto: TextDto) {
    if (!dto.text?.trim()) {
      throw new HttpException('El texto no puede estar vacío', HttpStatus.BAD_REQUEST);
    }
    try {
      const result = await this.gemini.clasificar(dto.text);
      return { success: true, ...result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpException(`Error Gemini: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('extraccion')
  @ApiOperation({
    summary: 'Probar extracción',
    description: 'Envía texto; Gemini 2.5 Flash Lite extrae datos estructurados (JSON).',
  })
  @ApiBody({ type: TextDto })
  @ApiResponse({ status: 200, description: 'Objeto con datos extraídos' })
  @ApiResponse({ status: 400, description: 'Texto vacío' })
  @ApiResponse({ status: 500, description: 'Error de Gemini' })
  async extraccion(@Body() dto: TextDto) {
    if (!dto.text?.trim()) {
      throw new HttpException('El texto no puede estar vacío', HttpStatus.BAD_REQUEST);
    }
    try {
      const data = await this.gemini.extraer(dto.text);
      return { success: true, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpException(`Error Gemini: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
