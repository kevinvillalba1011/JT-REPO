import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DocumentService } from './documents.service';
import { GetDocumentsDto } from './dto/get-documents.dto';
import { GetMetricsDto } from './dto/get-metrics.dto';
import { GetErroresIaDto } from './dto/get-errores-ia.dto';
import { GetCortesDto } from './dto/get-cortes.dto';

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
      'documento no tiene lote conocido). `corte` es opcional: si viene, ' +
      'filtra por ese corte exacto (usar junto con GET /documents/cortes ' +
      'para poblar el selector). `tipoOficio` es opcional: EMBARGO/' +
      'DESEMBARGO/ALCANCE filtran exacto, "SIN_TIPO" trae los que no son ' +
      'ninguna de esas 3 categorías. Ambos filtros son combinables entre sí.',
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

  @Get('cortes')
  @ApiOperation({
    summary: 'Cortes disponibles para una fecha de entrada',
    description:
      'Lista los cortes (CORTE_n, o SIN_CORTE si aplica) que existen para ' +
      'la fecha de entrada dada, ordenados numéricamente (CORTE_2 antes ' +
      'que CORTE_10). Fuente: documents (mismos documentos que devuelve ' +
      'GET /documents/errores-ia), no EntryReport. Pensado para poblar el ' +
      'selector de corte del front (b2b) después de elegir una fecha, ' +
      'antes de filtrar GET /documents/errores-ia por corte.',
  })
  @ApiResponse({
    status: 200,
    description:
      '{ cortes: string[] }, ordenados numéricamente; incluye "SIN_CORTE" ' +
      'si aparece para esa fecha (el front decide cómo mostrarlo).',
  })
  async getCortes(@Query() query: GetCortesDto) {
    return this.documentsService.getCortes(query.fechaEntrada);
  }
}
