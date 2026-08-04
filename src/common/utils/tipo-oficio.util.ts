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
