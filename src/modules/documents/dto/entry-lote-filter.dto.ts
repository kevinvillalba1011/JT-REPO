import { ApiPropertyOptional } from '@nestjs/swagger';
import { Matches, IsOptional } from 'class-validator';
import { DateRangeDto } from './date-range.dto';
import { FECHA_ENTRADA_REGEX, SIN_CORTE } from '@/common/utils/ruta-entrada.util';

/** `CORTE_n` (ej. "CORTE_1") o el sentinel `SIN_CORTE` (ver ruta-entrada.util). */
const CORTE_FILTER_REGEX = new RegExp(`^(CORTE_\\d+|${SIN_CORTE})$`);

/**
 * Filtros por lote de origen ([tipo_oficio]/[YYYYMMDD]/CORTE_[n]/), además
 * del rango de fecha de creación heredado de DateRangeDto. Compartida entre
 * GetDocumentsDto y GetMetricsDto para no duplicar la validación.
 */
export class EntryLoteFilterDto extends DateRangeDto {
  @ApiPropertyOptional({
    description:
      'Fecha de la carpeta de entrada del lote, formato YYYYMMDD (el ' +
      'segmento [tipo_oficio]/[YYYYMMDD]/CORTE_[n]/ de la ruta de origen). ' +
      'No confundir con fechaInicio/fechaFin, que filtran por fecha de ' +
      'creación del registro (createdAt).',
    example: '20260625',
  })
  @IsOptional()
  @Matches(FECHA_ENTRADA_REGEX, {
    message: 'fechaEntrada debe tener el formato YYYYMMDD',
  })
  fechaEntrada?: string;

  @ApiPropertyOptional({
    description:
      `Corte del lote de entrada: "CORTE_n" (ej. "CORTE_1") o "${SIN_CORTE}" ` +
      'para documentos de la forma vieja (sin subcarpeta de corte).',
    example: 'CORTE_1',
  })
  @IsOptional()
  @Matches(CORTE_FILTER_REGEX, {
    message: `corte debe tener el formato CORTE_n o ser "${SIN_CORTE}"`,
  })
  corte?: string;
}
