/**
 * Construye un jobId determinístico para BullMQ a partir del nombre de
 * archivo. Al usar siempre el mismo jobId para el mismo archivo físico,
 * BullMQ no permite que exista más de un job activo/pendiente con ese id en
 * una misma cola — un segundo intento de encolar el mismo archivo mientras el
 * primero sigue en curso queda naturalmente bloqueado, sin necesidad de un
 * chequeo manual contra la base de datos.
 *
 * Se sanitiza para evitar caracteres que puedan resultar problemáticos como
 * parte de una clave de Redis (espacios, acentos, etc.) — no necesita ser
 * reversible, solo estable: el mismo fileName siempre debe producir el mismo
 * jobId.
 */
export function buildDeterministicJobId(
  prefix: string,
  fileName: string,
): string {
  const sanitized = fileName.replace(/[^\w.-]+/g, '_').slice(0, 200);
  return `${prefix}:${sanitized}`;
}
