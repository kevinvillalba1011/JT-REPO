import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  Matches,
  IsOptional,
  Min,
} from 'class-validator';
import { FECHA_ENTRADA_REGEX } from '@/common/utils/ruta-entrada.util';
import { CORTE_FILTER_REGEX } from './entry-lote-filter.dto';

/**
 * Valores válidos de `tipoOficio` en GET /documents/errores-ia. Las 3
 * categorías reales de `documents.tipo_oficio`, más el sentinel `SIN_TIPO`
 * que representa "cualquier otra cosa" (null, vacío, "MASIVO", o cualquier
 * valor inesperado) — ver DocumentRepository.findErroresIa para el WHERE
 * exacto que arma cada caso.
 */
export const TIPO_OFICIO_FILTER_VALUES = [
  'EMBARGO',
  'DESEMBARGO',
  'ALCANCE',
  'SIN_TIPO',
] as const;
export type TipoOficioFiltro = (typeof TIPO_OFICIO_FILTER_VALUES)[number];

/**
 * Filtros de GET /documents/errores-ia. A diferencia de EntryLoteFilterDto
 * (fechaEntrada/corte opcionales, para filtrar por lote de origen puntual),
 * acá fechaInicio/fechaFin son OBLIGATORIOS: el endpoint siempre filtra por
 * un rango sobre la fecha EFECTIVA del documento (fecha_entrada, con
 * fallback a created_at — ver DocumentRepository.findErroresIa), nunca sobre
 * el universo completo. `corte` sí es opcional: sin él, devuelve todos los
 * cortes dentro del rango (comportamiento sin cambios respecto a antes).
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

  @ApiPropertyOptional({
    description:
      'Filtra por corte exacto (ej. "CORTE_1", o "SIN_CORTE" para ' +
      'documentos de la forma vieja sin subcarpeta de corte). Opcional — ' +
      'sin este filtro, devuelve todos los cortes dentro del rango de ' +
      'fechas. Usar junto con GET /documents/cortes para poblar el selector.',
    example: 'CORTE_1',
  })
  @IsOptional()
  @Matches(CORTE_FILTER_REGEX, {
    message: 'corte debe tener el formato CORTE_n o ser "SIN_CORTE"',
  })
  corte?: string;

  @ApiPropertyOptional({
    description:
      'Filtra por categoría del documento (tipo_oficio). EMBARGO/' +
      'DESEMBARGO/ALCANCE filtran exacto. "SIN_TIPO" trae los documentos ' +
      'cuyo tipo_oficio NO es ninguna de esas 3 (incluye null, vacío, o ' +
      'cualquier otro valor como "MASIVO" — ver ruta-entrada.util.ts). ' +
      'Opcional — sin este filtro, devuelve todas las categorías ' +
      '("Todos"). Combinable con `corte`.',
    enum: TIPO_OFICIO_FILTER_VALUES,
    example: 'EMBARGO',
  })
  @IsOptional()
  @IsIn(TIPO_OFICIO_FILTER_VALUES, {
    message: `tipoOficio debe ser uno de: ${TIPO_OFICIO_FILTER_VALUES.join(', ')}`,
  })
  tipoOficio?: TipoOficioFiltro;

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
