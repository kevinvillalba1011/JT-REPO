/**
 * Clasificación de `oficio.tipoOficio` compartida por el flujo individual (IA)
 * y el masivo (Excel).
 *
 * OJO con dos detalles del dato real:
 * - El flujo masivo guarda el tipo con sufijo (`"EMBARGO MASIVO"`,
 *   `"DESEMBARGO MASIVO"`, ...), por eso se compara por SUBSTRING y no por
 *   igualdad — mismo criterio que usa el backend Java (`tipoOficio.contains`).
 * - "DESEMBARGO" contiene "EMBARGO" como substring, así que DESEMBARGO se
 *   evalúa SIEMPRE primero.
 */
export function esDesembargo(tipoOficio: unknown): boolean {
  return typeof tipoOficio === 'string'
    ? tipoOficio.toUpperCase().includes('DESEMBARGO')
    : false;
}

export function esEmbargo(tipoOficio: unknown): boolean {
  return (
    typeof tipoOficio === 'string' &&
    tipoOficio.toUpperCase().includes('EMBARGO') &&
    !esDesembargo(tipoOficio)
  );
}

export function esAlcance(tipoOficio: unknown): boolean {
  return typeof tipoOficio === 'string'
    ? tipoOficio.toUpperCase().includes('ALCANCE')
    : false;
}

/** Sentinel de "sin dato" usado en todo el JSON (ver BLOQUE 1 del prompt). */
export const SIN_DATO = '0';

/** Valores válidos de `infoCliente.tipoAplicacion`. */
const TIPOS_APLICACION_VALIDOS = ['CONGELAR', 'DEBITAR'];

/**
 * Normaliza `infoCliente.tipoAplicacion` según el tipo de oficio.
 *
 * Regla de negocio: el default "CONGELAR" aplica a EMBARGO y ALCANCE (se
 * comportan igual para este campo). En DESEMBARGO el campo no tiene default:
 * siempre queda en "0", sin importar lo que haya extraído el modelo.
 *
 * Cualquier valor fuera de la lista cerrada se descarta a "0" (o al default
 * de EMBARGO/ALCANCE), para que el reporte nunca emita un tipo de aplicación
 * inventado.
 */
export function normalizarTipoAplicacion(
  tipoOficio: unknown,
  valor: unknown,
): string {
  if (esDesembargo(tipoOficio)) {
    return SIN_DATO;
  }

  const limpio = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
  const explicito = TIPOS_APLICACION_VALIDOS.includes(limpio) ? limpio : '';

  return explicito || 'CONGELAR';
}

export type DemandanteCoactivoPorDefectoResultado =
  | {
      accion: 'inyectar';
      demandantes: Array<{ tipoId: string; numeroId: string; nombre: string }>;
    }
  | { accion: 'sin-ente'; motivo: string }
  | { accion: 'sin-cambios' };

/**
 * Regla de negocio: en procesos COACTIVOS el ente que emite la medida
 * cautelar ES el demandante. Si `demandantes` no trae ningún elemento con
 * nombre válido, se deriva un demandante único a partir de
 * `nombreEnteEmbargante`. De la entidad embargante solo se conoce el nombre
 * — tipoId no es representable en el enum C/N/E/T/P del schema de Gemini —
 * así que tipoId/numeroId quedan en SIN_DATO ("0").
 *
 * `accion: 'sin-cambios'` cuando no corresponde inyectar: el proceso no es
 * COACTIVO, o ya hay un demandante válido (se respeta lo extraído por el
 * modelo). `accion: 'sin-ente'` cuando SÍ correspondería inyectar pero no
 * hay nombre de ente del cual derivarlo (caso a loguear como advertencia).
 */
export function demandanteCoactivoPorDefecto(
  tipoProceso: unknown,
  nombreEnteEmbargante: unknown,
  demandantes: unknown,
): DemandanteCoactivoPorDefectoResultado {
  const esCoactivo =
    typeof tipoProceso === 'string' &&
    tipoProceso.trim().toUpperCase() === 'COACTIVO';
  if (!esCoactivo) {
    return { accion: 'sin-cambios' };
  }

  const hayDemandanteValido =
    Array.isArray(demandantes) &&
    demandantes.some((d) => {
      if (!d || typeof d !== 'object') return false;
      const nombre = (d as Record<string, unknown>).nombre;
      return typeof nombre === 'string' && nombre !== '' && nombre !== SIN_DATO;
    });
  if (hayDemandanteValido) {
    return { accion: 'sin-cambios' };
  }

  const nombreEnte =
    typeof nombreEnteEmbargante === 'string' ? nombreEnteEmbargante : '';
  if (nombreEnte.trim() === '' || nombreEnte === SIN_DATO) {
    return {
      accion: 'sin-ente',
      motivo:
        'demandantes[] vacío en proceso COACTIVO pero ente.nombreEnteEmbargante también está vacío: no se puede inyectar demandante.',
    };
  }

  return {
    accion: 'inyectar',
    demandantes: [{ tipoId: SIN_DATO, numeroId: SIN_DATO, nombre: nombreEnte }],
  };
}
