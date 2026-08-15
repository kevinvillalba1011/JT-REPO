import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, Matches, IsOptional, Min } from 'class-validator';
import { FECHA_ENTRADA_REGEX } from '@/common/utils/ruta-entrada.util';

/**
 * Filtros de GET /documents/errores-ia. A diferencia de EntryLoteFilterDto
 * (fechaEntrada/corte opcionales, para filtrar por lote de origen puntual),
 * acá fechaInicio/fechaFin son OBLIGATORIOS: el endpoint siempre filtra por
 * un rango sobre la fecha EFECTIVA del documento (fecha_entrada, con
 * fallback a created_at — ver DocumentRepository.findErroresIa), nunca sobre
 * el universo completo.
 */
export class GetErroresIaDto {
  @ApiProperty({
    description:
      'Inicio del rango, formato YYYYMMDD. Filtra por la fecha EFECTIVA ' +
      'del documento (fecha_entrada del lote de origen, o created_at ' +
      'formateado a YYYYMMDD en hora de Bogotá si fecha_entrada es null).',
    example: '20260801',
  })
  @IsNotEmpty()
  @Matches(FECHA_ENTRADA_REGEX, {
    message: 'fechaInicio debe tener el formato YYYYMMDD',
  })
  fechaInicio: string;

  @ApiProperty({
    description:
      'Fin del rango, formato YYYYMMDD (mismo criterio que fechaInicio).',
    example: '20260815',
  })
  @IsNotEmpty()
  @Matches(FECHA_ENTRADA_REGEX, {
    message: 'fechaFin debe tener el formato YYYYMMDD',
  })
  fechaFin: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 25;
}
