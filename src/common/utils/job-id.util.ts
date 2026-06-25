/**
 * Construye un jobId determinístico para BullMQ a partir del nombre de
 * archivo. Al usar siempre el mismo jobId para el mismo archivo físico,
 * un segundo intento de encolarlo mientras el primero sigue activo/pendiente
 * no crea un job nuevo: BullMQ detecta que el jobId ya existe y devuelve el
 * job existente en silencio (NO lanza excepción en ese caso — ver
 * `handleDuplicatedJob` en el código fuente de BullMQ). Por eso cualquier
 * excepción real de `queue.add()` NUNCA es "duplicado", siempre es un error
 * genuino (jobId inválido, Redis caído, etc.) y debe tratarse como tal.
 *
 * IMPORTANTE: BullMQ prohíbe el carácter ':' en jobId custom (lanza
 * "Custom Id cannot contain :" salvo el caso muy específico de jobs
 * repetibles legacy con exactamente 2 ':'). Por eso el separador acá es '-',
 * nunca ':'.
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
  return `${prefix}-${sanitized}`;
}
