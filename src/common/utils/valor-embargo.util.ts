/**
 * Parsea montos en formato colombiano a entero (COP, sin decimales).
 * Un último separador ('.' o ',') seguido de 1-2 dígitos al final es parte decimal (se trunca);
 * todo otro separador es de miles.
 *
 * Caso ambiguo conocido y aceptado (regla de negocio, no un bug): un valor
 * como "1,50" o "1.50" con separador de miles de solo 1-2 dígitos finales es
 * indistinguible de un decimal real y SIEMPRE se trata como decimal (trunca
 * a 1), nunca como miles (150). En la práctica los montos de embargo no
 * llegan con un grupo de miles final de 1-2 dígitos (siempre son grupos de
 * 3), así que el caso no se presenta con datos reales — ver
 * valor-embargo.util.spec.ts para el comportamiento fijado.
 */
export function parseValorEmbargo(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.trunc(raw) : 0;
  }
  // Cualquier otro tipo (objeto, booleano, etc.) no es un monto válido.
  if (typeof raw !== 'string' && raw !== null && raw !== undefined) {
    return 0;
  }
  const limpio = (raw ?? '').replace(/[^\d.,]/g, '');
  if (!limpio) return 0;
  const m = limpio.match(/^(.+?)[.,](\d{1,2})$/);
  const digitos = (m ? m[1] : limpio).replace(/[.,]/g, '');
  const valor = Number(digitos);
  return Number.isFinite(valor) ? valor : 0;
}
