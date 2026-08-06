import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Payload del endpoint manual de relectura (`POST /entry-report/reprocesar`).
 * Identifica un corte de entrada por su terna (tipoOficio, fechaEntrada,
 * corte), la misma que usa `EntryReportRepository` para su clave única
 * (`tipoOficio_fechaEntrada_corte`).
 */
export class ReprocesarCorteDto {
  @ApiProperty({
    description:
      'Nombre de la carpeta fuente del tipo de oficio (acepta variantes de mayúsculas/minúsculas y el plural de carpeta, ej. "embargos"). Se normaliza con normalizarTipoOficioCarpeta().',
    example: 'embargos',
  })
  @IsString()
  @IsNotEmpty()
  tipoOficio: string;

  @ApiProperty({
    description: 'Fecha de entrada en formato YYYYMMDD.',
    example: '20260806',
  })
  @Matches(/^\d{8}$/, {
    message: 'fechaEntrada debe tener el formato YYYYMMDD',
  })
  fechaEntrada: string;

  @ApiProperty({
    description:
      'Nombre de la subcarpeta de corte (acepta minúsculas, ej. "corte_1"). Se normaliza a mayúsculas.',
    example: 'CORTE_1',
  })
  @Matches(/^CORTE_\d+$/i, {
    message: 'corte debe tener el formato CORTE_<n> (ej. CORTE_1)',
  })
  corte: string;
}
