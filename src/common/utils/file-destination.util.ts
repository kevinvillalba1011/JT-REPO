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

/**
 * Mueve `filePath` a una subcarpeta con la fecha del día actual (yyyyMMdd,
 * hora Bogotá) dentro de `baseDir`, igual que el destino de los documentos
 * procesados exitosamente (ver `model.processor.ts`/`massive-excel.service.ts`).
 * Evita colisiones de nombre vía `resolverRutaSinColision` y crea la
 * subcarpeta si no existe. `fileName` permite pasar un nombre distinto al de
 * `filePath` (ej. cuando el archivo original ya no existe en su ruta y se
 * reconstruye desde el nombre guardado en DB). Retorna la ruta final.
 */
export async function moverArchivoAFechaDestino(
  baseDir: string,
  filePath: string,
  fileName?: string,
): Promise<string> {
  const destDir = path.join(baseDir, carpetaFechaBogota());
  await fs.promises.mkdir(destDir, { recursive: true });

  const nombre = fileName ?? path.basename(filePath);
  const ext = path.extname(nombre);
  const baseName = path.basename(nombre, ext);
  const destino = await resolverRutaSinColision(destDir, baseName, ext);

  try {
    await fs.promises.rename(filePath, destino);
  } catch {
    await fs.promises.copyFile(filePath, destino);
    await fs.promises.unlink(filePath);
  }

  return destino;
}
