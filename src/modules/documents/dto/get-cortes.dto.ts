import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';
import { FECHA_ENTRADA_REGEX } from '@/common/utils/ruta-entrada.util';

/**
 * Filtro de GET /documents/cortes: fechaEntrada es obligatoria (no tiene
 * sentido pedir "los cortes" sin fecha) — mismo formato/regex que el resto
 * del módulo (YYYYMMDD, ver ruta-entrada.util.ts).
 */
export class GetCortesDto {
  @ApiProperty({
    description:
      'Fecha de entrada, formato YYYYMMDD (el segmento [tipo_oficio]/' +
      '[YYYYMMDD]/CORTE_[n]/ de la ruta de origen).',
    example: '20260828',
  })
  @IsNotEmpty()
  @Matches(FECHA_ENTRADA_REGEX, {
    message: 'fechaEntrada debe tener el formato YYYYMMDD',
  })
  fechaEntrada: string;
}
