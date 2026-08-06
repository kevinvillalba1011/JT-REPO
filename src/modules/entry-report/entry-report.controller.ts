import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EntryReportManualService } from './entry-report-manual.service';
import { ReprocesarCorteDto } from './dto/reprocesar-corte.dto';

@ApiTags('Entry Report')
@Controller('entry-report')
export class EntryReportController {
  constructor(
    private readonly entryReportManualService: EntryReportManualService,
  ) {}

  @Post('reprocesar')
  @ApiOperation({
    summary:
      'Repite la lectura de una carpeta [tipo_oficio]/[YYYYMMDD]/CORTE_[n] y regenera su reporte de entrada',
  })
  @ApiResponse({
    status: 200,
    description:
      'Resultado de la relectura: archivos encontrados/encolados y la ruta del reporte regenerado.',
  })
  async reprocesar(@Body() dto: ReprocesarCorteDto) {
    return this.entryReportManualService.reprocesarCorte(dto);
  }
}
