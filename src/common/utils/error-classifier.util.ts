/**
 * Códigos de error gRPC (usados por Document AI vía google-gax) y códigos
 * HTTP que indican una falla PERMANENTE: reintentar no va a cambiar el
 * resultado (argumento inválido, recurso no encontrado, credenciales mal
 * configuradas, etc.). Para estos casos NO debe reintentarse — cortar de
 * inmediato evita minutos de espera y llamadas extra a APIs de pago.
 *
 * Cualquier otro código (rate limit, timeout, no disponible, error interno)
 * se trata como transitorio y sí amerita reintento con backoff.
 */
const PERMANENT_GRPC_CODES = new Set([
  3, // INVALID_ARGUMENT
  5, // NOT_FOUND
  7, // PERMISSION_DENIED
  9, // FAILED_PRECONDITION
  11, // OUT_OF_RANGE
  16, // UNAUTHENTICATED
]);

const PERMANENT_HTTP_STATUS = new Set([400, 401, 403, 404, 422]);

/** Determina si un error de una API externa (Document AI, Gemini) es permanente y no debe reintentarse. */
export function isPermanentError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as Record<string, unknown>;

  if (typeof err.code === 'number' && PERMANENT_GRPC_CODES.has(err.code)) {
    return true;
  }

  const httpStatus =
    (typeof err.status === 'number' && err.status) ||
    (typeof err.statusCode === 'number' && err.statusCode);
  if (httpStatus && PERMANENT_HTTP_STATUS.has(httpStatus)) {
    return true;
  }

  return false;
}
