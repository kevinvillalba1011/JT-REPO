import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class DateRangeDto {
  @ApiPropertyOptional({
    description:
      'Fecha/hora de inicio del rango (ISO 8601). Si se envía solo fecha ' +
      '(sin hora, ej. "2026-06-25"), se interpreta como el inicio de ese ' +
      'día en hora de Bogotá (00:00:00). Para horarios completos, incluir ' +
      'siempre el offset explícito (ej. "-05:00") para evitar ambigüedad.',
    example: '2026-06-25T00:00:00-05:00',
  })
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @ApiPropertyOptional({
    description:
      'Fecha/hora de fin del rango (ISO 8601). Si se envía solo fecha ' +
      '(sin hora, ej. "2026-06-25"), se completa automáticamente al fin de ' +
      'ese día en hora de Bogotá (23:59:59.999) para incluir todo el día. ' +
      'Para horarios completos, incluir siempre el offset explícito (ej. ' +
      '"-05:00") para evitar ambigüedad.',
    example: '2026-06-25T23:59:59-05:00',
  })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
