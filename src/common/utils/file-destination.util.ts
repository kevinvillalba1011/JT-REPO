import * as fs from 'fs';
import * as path from 'path';
import { nowBogotaDate } from '@/common/utils/date.util';

/**
 * Retorna la fecha actual en hora de Bogotá, formateada como "yyyyMMdd"
 * (ej. "20260716"). Prefijo por año (en vez de día primero) para que las
 * subcarpetas ordenen alfabéticamente en orden cronológico al listar el
 * directorio destino.
 */
export function carpetaFechaBogota(): string {
  const hoyBogota = nowBogotaDate();
  const yyyy = String(hoyBogota.getUTCFullYear());
  const mm = String(hoyBogota.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(hoyBogota.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Resuelve una ruta destino libre dentro de `dir` para `baseName+ext`, evitando
 * colisiones cuando ya existe un archivo con ese mismo nombre (dos documentos
 * distintos pueden generar el mismo nombre final). Si `dir/baseName+ext` ya
 * existe, prueba sufijos incrementales `-1`, `-2`, ... hasta encontrar uno libre.
 */
export async function resolverRutaSinColision(
  dir: string,
  baseName: string,
  ext: string,
): Promise<string> {
  let candidato = path.join(dir, `${baseName}${ext}`);
  let sufijo = 0;

  while (await existePath(candidato)) {
    sufijo += 1;
    candidato = path.join(dir, `${baseName}-${sufijo}${ext}`);
  }

  return candidato;
}

async function existePath(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
