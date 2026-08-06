import * as path from 'path';
import { carpetaFechaBogota } from './file-destination.util';

/**
 * Utilidades para interpretar la ubicacion de un archivo dentro de las
 * carpetas fuente de ingesta (`LOCAL_SOURCE_PATHS`).
 *
 * Los oficios ahora llegan organizados como
 * `[tipo_oficio]/[YYYYMMDD]/CORTE_[n]/*`, pero hay que seguir soportando la
 * forma vieja (archivos sueltos directamente en la raiz del tipo, o en una
 * subcarpeta de fecha sin cortes). Este modulo NO toca el filesystem: recibe
 * las rutas ya resueltas y decide como clasificarlas.
 */

/** Sentinel usado cuando la ruta no trae informacion de corte (forma vieja). */
export const SIN_CORTE = 'SIN_CORTE';

/** Nombre de subcarpeta de corte, estricto y en mayusculas: `CORTE_1`, `CORTE_23`, ... */
export const CORTE_REGEX = /^CORTE_(\d+)$/;

/** Nombre de subcarpeta de fecha de entrada: exactamente 8 digitos (YYYYMMDD). */
export const FECHA_ENTRADA_REGEX = /^\d{8}$/;

export interface MetadatosEntrada {
  /** Tipo de oficio canonico (EMBARGO | DESEMBARGO | ALCANCE | MASIVO). */
  tipoOficio: string;
  /** Fecha de entrada en formato 'YYYYMMDD'. */
  fechaEntrada: string;
  /** 'CORTE_n' si la ruta trae corte, o SIN_CORTE si no. */
  corte: string;
  /** Ruta absoluta completa de la carpeta escaneada. */
  ruta: string;
  /** true si la ruta NO viene de una carpeta CORTE_[n] (forma vieja). */
  legacy: boolean;
}

/**
 * Mapa de nombres de carpeta (plural) al vocabulario canonico de
 * `tipoOficio` ya usado en el resto del repo (ver `tipo-oficio.util.ts` y
 * `SUPPORTED_TIPOS_OFICIO` en `excel-field-mapping.ts`).
 */
const CARPETA_A_TIPO_OFICIO: Record<string, string> = {
  EMBARGOS: 'EMBARGO',
  DESEMBARGOS: 'DESEMBARGO',
  ALCANCES: 'ALCANCE',
  MASIVOS: 'MASIVO',
};

/**
 * Normaliza el nombre de una carpeta fuente (ej. "embargos", "Desembargos")
 * al vocabulario canonico usado en `oficio.tipoOficio` (EMBARGO,
 * DESEMBARGO, ALCANCE, MASIVO). Case-insensitive. Si el nombre no matchea
 * ninguno conocido, se devuelve tal cual en mayusculas (no se lanza error,
 * para no tumbar el escaneo por una carpeta fuente inesperada).
 */
export function normalizarTipoOficioCarpeta(nombreCarpeta: string): string {
  const clave = nombreCarpeta.trim().toUpperCase();
  return CARPETA_A_TIPO_OFICIO[clave] ?? clave;
}

/** true si `nombre` es una subcarpeta de corte valida (mayusculas estrictas, ej. "CORTE_1"). */
export function esCorteValido(nombre: string): boolean {
  return CORTE_REGEX.test(nombre);
}

/**
 * Extrae el numero `n` de una subcarpeta `CORTE_[n]`. Devuelve
 * `Number.MAX_SAFE_INTEGER` cuando `nombre` no matchea, para que ese valor
 * ordene siempre al final (en vez de reventar un `sort`). Sirve para
 * ordenar cortes numericamente (CORTE_2 antes que CORTE_10), no
 * lexicograficamente.
 */
export function numeroCorte(nombre: string): number {
  const match = CORTE_REGEX.exec(nombre);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * true si `valor` cumple el formato YYYYMMDD Y ademas representa una fecha
 * real (mes 01-12, dia valido para ese mes/año, incluyendo años bisiestos).
 * Se valida reconstruyendo la fecha con UTC y comparando los componentes de
 * vuelta, porque `Date` normaliza silenciosamente overflows (ej. "20200230"
 * se convertiria en 2020-03-01 si no se revierte la comparacion).
 */
export function esFechaEntradaValida(valor: string): boolean {
  if (!FECHA_ENTRADA_REGEX.test(valor)) {
    return false;
  }

  const anio = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(4, 6));
  const dia = Number(valor.slice(6, 8));

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return false;
  }

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

/** Segmentos de ruta relativa entre `sourceRoot` y `dirPath`, normalizados con '/'. */
function segmentosRelativos(sourceRoot: string, dirPath: string): string[] {
  const relativo = path.relative(sourceRoot, dirPath);
  if (relativo === '') {
    return [];
  }
  return relativo.split(path.sep).filter((segmento) => segmento !== '');
}

/**
 * Interpreta `dirPath` (el directorio donde esta un archivo escaneado)
 * relativo a `sourceRoot` (la raiz del tipo de oficio, ej.
 * `.../local/embargos`) y devuelve los metadatos de entrada, o `null`
 * cuando la ruta no corresponde a una ubicacion soportada.
 *
 * `opciones.hayCortesEnFecha` lo calcula el llamador (`LocalFileStrategy`)
 * inspeccionando el filesystem: indica si la carpeta de fecha en cuestion
 * ya tiene subcarpetas `CORTE_[n]`. Esta funcion es pura y no toca disco,
 * asi que ese dato se le debe pasar explicitamente.
 *
 * Profundidad 0 (dirPath === sourceRoot): forma vieja, archivo suelto en la
 * raiz del tipo. Se usa la fecha de HOY (`carpetaFechaBogota()`) como fecha
 * de entrada, sin corte.
 *
 * Profundidad 1 (sourceRoot/FECHA): si el segmento no es una fecha valida,
 * `null`. Si es valida y la carpeta de fecha YA tiene cortes
 * (`hayCortesEnFecha: true`), el archivo suelto esta mal ubicado -> `null`
 * (se ignora, pertenece a algun corte). Si NO hay cortes en esa fecha, es
 * forma vieja con fecha explicita.
 *
 * Profundidad 2 (sourceRoot/FECHA/CORTE_n): forma nueva. Valida solo si el
 * primer segmento es fecha valida y el segundo es un corte valido
 * (mayusculas estrictas).
 *
 * Profundidad >= 3: no soportada, `null`.
 */
export function parsearRutaEntrada(
  sourceRoot: string,
  dirPath: string,
  opciones?: { hayCortesEnFecha?: boolean },
): MetadatosEntrada | null {
  const tipoOficio = normalizarTipoOficioCarpeta(path.basename(sourceRoot));
  const ruta = path.resolve(dirPath);
  const segmentos = segmentosRelativos(sourceRoot, dirPath);

  if (segmentos.length === 0) {
    return {
      tipoOficio,
      fechaEntrada: carpetaFechaBogota(),
      corte: SIN_CORTE,
      ruta,
      legacy: true,
    };
  }

  if (segmentos.length === 1) {
    const [fecha] = segmentos;
    if (!esFechaEntradaValida(fecha)) {
      return null;
    }
    if (opciones?.hayCortesEnFecha === true) {
      // Archivo suelto en una carpeta de fecha que ya tiene cortes: esta
      // mal ubicado, pertenece a alguno de los CORTE_n. Se ignora.
      return null;
    }
    return {
      tipoOficio,
      fechaEntrada: fecha,
      corte: SIN_CORTE,
      ruta,
      legacy: true,
    };
  }

  if (segmentos.length === 2) {
    const [fecha, corte] = segmentos;
    if (!esFechaEntradaValida(fecha) || !esCorteValido(corte)) {
      return null;
    }
    return {
      tipoOficio,
      fechaEntrada: fecha,
      corte,
      ruta,
      legacy: false,
    };
  }

  return null;
}
