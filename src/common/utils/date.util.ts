/**
 * Colombia (America/Bogota) no tiene horario de verano, su offset es
 * siempre UTC-5. `Date.prototype.toISOString()` retorna UTC, por lo que
 * usarlo directamente para campos que el receptor externo interpreta como
 * hora local de Bogotá genera un desfase de 5 horas.
 */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Retorna la fecha/hora actual como string ISO 8601 en hora de Bogotá (sin sufijo de zona). */
export function nowBogotaISOString(): string {
  return toBogotaISOString(new Date());
}

/** Convierte un `Date` (instante UTC) a su string ISO 8601 equivalente en hora de Bogotá. */
export function toBogotaISOString(date: Date): string {
  return toBogotaDate(date).toISOString().replace('Z', '');
}

/**
 * Retorna un `Date` cuyos campos UTC (al leerlos con getUTC* o toISOString)
 * representan la hora de Bogotá actual. Útil para columnas Prisma `DateTime`
 * (timestamp sin zona) donde se busca que el valor crudo en la DB sea hora
 * de Bogotá en vez de UTC.
 */
export function nowBogotaDate(): Date {
  return toBogotaDate(new Date());
}

function toBogotaDate(date: Date): Date {
  return new Date(date.getTime() - BOGOTA_OFFSET_MS);
}

/**
 * Formatea un `Date` que ya fue almacenado/generado con `nowBogotaDate()`
 * (es decir, su valor crudo ya representa hora de Bogotá). A diferencia de
 * `toBogotaISOString`, NO resta el offset de nuevo — solo retira el sufijo
 * `Z` para no etiquetarlo como UTC.
 */
export function formatBogotaDate(date: Date): string {
  return date.toISOString().replace('Z', '');
}
