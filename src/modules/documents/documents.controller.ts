import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DocumentService } from './documents.service';
import { GetDocumentsDto } from './dto/get-documents.dto';
import { GetMetricsDto } from './dto/get-metrics.dto';
import { GetErroresIaDto } from './dto/get-errores-ia.dto';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentService) {}

  @Get()
  @ApiOperation({
    summary: 'List documents',
    description:
      'Lista paginada de documentos. Filtrable por state, por rango de ' +
      'fecha de creación (fechaInicio/fechaFin) y/o por el lote de origen ' +
      '(fechaEntrada + corte, ver [tipo_oficio]/[YYYYMMDD]/CORTE_[n]/).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Documentos paginados. Cada documento incluye un campo "error" ' +
      'normalizado (null si no aplica) derivado de ocrText, jsonModel.error ' +
      'o integrationError según corresponda al state/integrationStatus.',
  })
  async findAll(@Query() query: GetDocumentsDto) {
    return this.documentsService.findAll(query);
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'Get document processing metrics',
    description:
      'Conteo total y por state. Filtrable por rango de fecha de creación ' +
      '(fechaInicio/fechaFin) y/o por lote de origen (fechaEntrada + corte).',
  })
  @ApiResponse({ status: 200, description: 'Return metrics.' })
  async getMetrics(@Query() query: GetMetricsDto) {
    return this.documentsService.getMetrics(query);
  }

  @Get('errores-ia')
  @ApiOperation({
    summary: 'List IA/OCR error documents',
    description:
      'Lista paginada de documentos en estado de error IA (MODEL_ERROR, ' +
      'ERROR_OCR, FORMATO_NO_SOPORTADO) dentro de [fechaInicio, fechaFin] ' +
      '(YYYYMMDD, ambos obligatorios), filtrando por la fecha EFECTIVA del ' +
      'documento (fecha_entrada del lote de origen, o created_at si el ' +
      'documento no tiene lote conocido).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Documentos paginados con nombreArchivo, createdAt, fechaEntrada, ' +
      'corte, estado, error (normalizado, ver deriveError) y ruta (ruta ' +
      'física del archivo movido, real o derivada).',
  })
  async getErroresIa(@Query() query: GetErroresIaDto) {
    return this.documentsService.getErroresIa(query);
  }
}
