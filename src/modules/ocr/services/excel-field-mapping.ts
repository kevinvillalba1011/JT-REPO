/**
 * Mapeo de encabezados de las plantillas Excel (EMBARGO, DESEMBARGO, ALCANCE)
 * hacia las rutas del JSON final anidado (mismo formato que el perfil davibank).
 */
import { parseValorEmbargo } from '@/common/utils/valor-embargo.util';
import { normalizarTipoAplicacion } from '@/common/utils/tipo-oficio.util';
import { normalizarCorreos } from '@/common/utils/correo.util';

export type FieldType = 'string' | 'number' | 'array';

export interface FieldMapping {
  path: string;
  type: FieldType;
}

export const EXCEL_FIELD_MAP: Record<string, FieldMapping> = {
  'NO ID DEMANDADO': { path: 'demandados[0].numeroId', type: 'string' },
  'TIPO DE PROCESO': { path: 'ente.tipoProceso', type: 'string' },
  'NOMBRE OFICIO INICIAL': {
    path: 'oficio.nombreOficioInicial',
    type: 'string',
  },
  'NOMBRE OFICIO FINAL': { path: 'oficio.nombreOficioFinal', type: 'string' },
  'VALOR EMBARGO': { path: 'demandados[0].valorEmbargo', type: 'number' },
  'NO. DE RADICADO': { path: 'demandados[0].numeroRadicado', type: 'string' },
  'CUENTA BANCO AGRARIO / BANCO DEPÓSITO JUDICIAL': {
    path: 'oficio.cuentaDepositoJudicial',
    type: 'string',
  },
  'NOMBRE BANCO DEPÓSITO JUDICIAL': {
    path: 'oficio.nombreBancoDepositoJudicial',
    type: 'string',
  },
  'NOMBRE DEL SECRETARIO O FUNCIONARIO ENTE EMBARGANTE': {
    path: 'ente.nombreSecretarioFuncionario',
    type: 'string',
  },
  'CODIGO DE ALCANCE': { path: 'infoCliente.codigoAlcance', type: 'string' },
  'CODIGO DE APLICACIÓN': {
    path: 'infoCliente.codigoAplicacion',
    type: 'string',
  },
  'TIPO LIMITE DE INEMBARGABILIDAD': {
    path: 'oficio.tipoLimiteInembargabilidad',
    type: 'string',
  },
  'TIPO DE APLICACIÓN': {
    path: 'infoCliente.tipoAplicacion',
    type: 'string',
  },
  'TIPO RESPUESTA': { path: 'infoCliente.tipoRespuesta', type: 'string' },
  'TIPO ID DEMANDADO': { path: 'demandados[0].tipoId', type: 'string' },
  'NOMBRE DEMANDADO': { path: 'demandados[0].nombre', type: 'string' },
  'TIPO ID DEMANDANTE': { path: 'demandantes[0].tipoId', type: 'string' },
  'NO ID DEMANDANTE': { path: 'demandantes[0].numeroId', type: 'string' },
  'NOMBRE DEMANDANTE': { path: 'demandantes[0].nombre', type: 'string' },
  'NOMBRE DEL ENTE EMBARGANTE': {
    path: 'ente.nombreEnteEmbargante',
    type: 'string',
  },
  CIUDAD: { path: 'ente.ciudad', type: 'string' },
  'CORREOS ELECTRÓNICOS': {
    path: 'ente.correosElectronicos',
    type: 'array',
  },
  'LINK DE COLOCACIÓN DE RESPUESTA': {
    path: 'ente.linkColocacionRespuesta',
    type: 'string',
  },
  'PRODUCTOS A EMBARGAR': {
    path: 'demandados[0].cuentas[0].productosAEmbargar',
    type: 'string',
  },
  'SI ES CTA ESPECÍFICA, NO. DE CTA': {
    path: 'demandados[0].cuentas[0].numeroCuenta',
    type: 'string',
  },
  'PORCENTAJE A EMBARGAR': {
    path: 'demandados[0].porcentajeAEmbargar',
    type: 'string',
  },
  'PRODUCTOS A FUTURO': {
    path: 'demandados[0].productosFuturo',
    type: 'string',
  },
  'TIPO DOCUMENTO RECIBIDO EN EMAIL': {
    path: 'infoCliente.tipoDocumentoRecibidoEmail',
    type: 'array',
  },
  'TIPO DE REQUERIMIENTO': {
    path: 'oficio.tipoRequerimiento',
    type: 'string',
  },
  'TIPO DE REQUERIMIENTO INEMBARGABLE': {
    path: 'oficio.tipoRequerimientoInembargable',
    type: 'string',
  },
  OBSERVACIONES: { path: 'oficio.observaciones', type: 'string' },
  // Cada fila del Excel es un demandado (ver mapRowToPayload), así que tanto el
  // oficio como el radicado a desembargar de cada fila se asignan a SU
  // demandado — no al oficio compartido — para que cada uno conserve el suyo
  // si difieren.
  'OFICIO DE EMBARGO A DESEMBARGAR': {
    path: 'demandados[0].oficioEmbargoADesembargar',
    type: 'string',
  },
  'RADICADO OFICIO DE EMBARGO A DESEMBARGAR': {
    path: 'demandados[0].radicadoADesembargar',
    type: 'string',
  },
};

/** Tipos de oficio soportados, identificados por el nombre de la hoja del Excel. */
export const SUPPORTED_TIPOS_OFICIO = ['EMBARGO', 'DESEMBARGO', 'ALCANCE'];

/**
 * Encabezados EXACTOS (texto y orden) de la fila de cabecera de cada
 * plantilla oficial (`Plantilla_EMBARGO.xlsx`, `Plantilla_DESEMBARGO.xlsx`,
 * `Plantilla_ALCANCE.xlsx`, raíz del repo), confirmados leyendo esos 3
 * archivos con exceljs. Es la fuente de verdad que `MassiveExcelService`
 * usa para rechazar un Excel masivo cuyas columnas no permitan identificar
 * los campos esperados — ver el comentario junto a la validación en
 * `massive-excel.service.ts` para el criterio exacto de comparación
 * (faltantes vs. extra).
 *
 * OJO: DESEMBARGO NO es un subconjunto trivial de EMBARGO/ALCANCE — trae
 * "NO. DE RADICADO" y "TIPO ID DEMANDADO" en posiciones distintas y un set
 * de columnas mucho más corto.
 */
export const PLANTILLA_HEADERS: Record<string, string[]> = {
  EMBARGO: [
    'NO ID DEMANDADO',
    'TIPO DE PROCESO',
    'NOMBRE OFICIO INICIAL',
    'NOMBRE OFICIO FINAL',
    'VALOR EMBARGO',
    'NO. DE RADICADO',
    'CUENTA BANCO AGRARIO / BANCO DEPÓSITO JUDICIAL',
    'NOMBRE BANCO DEPÓSITO JUDICIAL',
    'NOMBRE DEL SECRETARIO O FUNCIONARIO ENTE EMBARGANTE',
    'CODIGO DE ALCANCE',
    'CODIGO DE APLICACIÓN',
    'TIPO LIMITE DE INEMBARGABILIDAD',
    'TIPO DE APLICACIÓN',
    'TIPO RESPUESTA',
    'TIPO ID DEMANDADO',
    'NOMBRE DEMANDADO',
    'TIPO ID DEMANDANTE',
    'NO ID DEMANDANTE',
    'NOMBRE DEMANDANTE',
    'NOMBRE DEL ENTE EMBARGANTE',
    'CIUDAD',
    'CORREOS ELECTRÓNICOS',
    'LINK DE COLOCACIÓN DE RESPUESTA',
    'PRODUCTOS A EMBARGAR',
    'SI ES CTA ESPECÍFICA, NO. DE CTA',
    'PORCENTAJE A EMBARGAR',
    'PRODUCTOS A FUTURO',
    'TIPO DOCUMENTO RECIBIDO EN EMAIL',
    'TIPO DE REQUERIMIENTO',
    'TIPO DE REQUERIMIENTO INEMBARGABLE',
    'OBSERVACIONES',
  ],
  DESEMBARGO: [
    'NO ID DEMANDADO',
    'TIPO DE PROCESO',
    'NOMBRE OFICIO INICIAL',
    'NOMBRE OFICIO FINAL',
    'NO. DE RADICADO',
    'TIPO ID DEMANDADO',
    'NOMBRE DEMANDADO',
    'OFICIO DE EMBARGO A DESEMBARGAR',
    'RADICADO OFICIO DE EMBARGO A DESEMBARGAR',
    'TIPO DOCUMENTO RECIBIDO EN EMAIL',
  ],
  ALCANCE: [
    'NO ID DEMANDADO',
    'TIPO DE PROCESO',
    'NOMBRE OFICIO INICIAL',
    'NOMBRE OFICIO FINAL',
    'VALOR EMBARGO',
    'NO. DE RADICADO',
    'CUENTA BANCO AGRARIO / BANCO DEPÓSITO JUDICIAL',
    'NOMBRE BANCO DEPÓSITO JUDICIAL',
    'NOMBRE DEL SECRETARIO O FUNCIONARIO ENTE EMBARGANTE',
    'TIPO DE APLICACIÓN',
    'TIPO RESPUESTA',
    'TIPO ID DEMANDADO',
    'NOMBRE DEMANDADO',
    'NOMBRE DEMANDANTE',
    'NOMBRE DEL ENTE EMBARGANTE',
    'CIUDAD',
    'CORREOS ELECTRÓNICOS',
    'LINK DE COLOCACIÓN DE RESPUESTA',
    'TIPO DOCUMENTO RECIBIDO EN EMAIL',
    'TIPO DE REQUERIMIENTO',
    'OBSERVACIONES',
  ],
};

/** Estructura por defecto del JSON final, siguiendo la convención del perfil davibank. */
export function buildDefaultPayload(): Record<string, any> {
  return {
    oficio: {
      tipoOficio: '0',
      nombreOficioInicial: '0',
      nombreOficioFinal: '0',
      fechaHoraProcesamientoOficio: '0',
      observaciones: '0',
      tipoRequerimiento: '0',
      tipoRequerimientoInembargable: '0',
      tipoLimiteInembargabilidad: '0',
      rutaPdf: '0',
      cuentaDepositoJudicial: '0',
      nombreBancoDepositoJudicial: '0',
    },
    demandados: [
      {
        tipoId: '0',
        numeroId: '0',
        numeroRadicado: '0',
        nombre: '0',
        cuentas: [
          {
            productosAEmbargar: '0',
            numeroCuenta: '0',
          },
        ],
        productosFuturo: '0',
        porcentajeAEmbargar: '0',
        valorEmbargo: 0,
        oficioEmbargoADesembargar: '0',
        radicadoADesembargar: '0',
      },
    ],
    demandantes: [
      {
        tipoId: '0',
        numeroId: '0',
        nombre: '0',
      },
    ],
    ente: {
      nombreSecretarioFuncionario: '0',
      nombreEnteEmbargante: '0',
      ciudad: '0',
      tipoProceso: '0',
      correosElectronicos: [],
      linkColocacionRespuesta: '0',
    },
    infoCliente: {
      fechaHoraRecepcionCorreo: '0',
      tipoDocumentoRecibidoEmail: [],
      codigoAlcance: '0',
      codigoAplicacion: '0',
      // Sin default: `mapRowToPayload` resuelve el valor final según el tipo de
      // oficio (CONGELAR solo aplica a EMBARGO — ver normalizarTipoAplicacion).
      tipoAplicacion: '0',
      tipoRespuesta: '0',
      vinculoCliente: '0',
    },
  };
}

/**
 * Normaliza un encabezado de columna para comparaciones tolerantes a
 * espacios/mayúsculas: colapsa espacios repetidos, recorta y pasa a
 * mayúsculas. Se exporta para que `MassiveExcelService` valide los
 * encabezados detectados contra `PLANTILLA_HEADERS` con el mismo criterio
 * que usa `mapRowToPayload` para mapear cada columna.
 */
export function normalizeHeader(header: unknown): string {
  if (header === null || header === undefined) {
    return '';
  }
  return (typeof header === 'string' ? header : JSON.stringify(header))
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function formatCellValue(value: any): string {
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(
      value.getHours(),
    )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  return String(value).trim();
}

/** Asigna `value` en `obj` siguiendo una ruta tipo "demandados[0].cuentas[0].productosAEmbargar". */
function setByPath(obj: Record<string, any>, path: string, value: any): void {
  const tokens = path.match(/[^.[\]]+/g) || [];
  let current = obj;

  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    const nextKeyIsIndex = /^\d+$/.test(tokens[i + 1]);

    if (current[key] === undefined) {
      current[key] = nextKeyIsIndex ? [] : {};
    }
    current = current[key];
  }

  current[tokens[tokens.length - 1]] = value;
}

/**
 * Mapea una fila del Excel (array de valores por columna) al JSON final anidado,
 * usando los encabezados de la fila de cabecera para ubicar cada valor.
 * Las posiciones que el Excel no cubre quedan con los valores por defecto.
 *
 * `tipoOficio` y `fechaProcesamiento` se asignan automáticamente (no provienen
 * de columnas del Excel), de la misma forma en que el flujo de IA los inyecta
 * en `ModelProcessor`.
 */
export function mapRowToPayload(
  headers: any[],
  row: any[],
  tipoOficio: string,
  fechaProcesamiento: string,
): Record<string, any> {
  const payload = buildDefaultPayload();

  headers.forEach((header, idx) => {
    const mapping = EXCEL_FIELD_MAP[normalizeHeader(header)];
    if (!mapping) return;

    const rawValue = row[idx];
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return;
    }

    switch (mapping.type) {
      case 'number': {
        // Único caso 'number' hoy es VALOR EMBARGO: usa el mismo parser que
        // el flujo IA para interpretar correctamente el separador decimal
        // colombiano (ej. "16.000.000.00" -> 16000000, no 1600000000).
        setByPath(payload, mapping.path, parseValorEmbargo(rawValue));
        break;
      }
      case 'array': {
        const arr = String(rawValue)
          .split(/[,;]/)
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
        if (arr.length === 0) return;
        // La celda de correos suele venir pegada de un PDF o de otro Excel y
        // arrastra la misma basura que el flujo IA (viñetas, "mailto:",
        // puntuación final): se sanea con el mismo criterio.
        const valorFinal =
          mapping.path === 'ente.correosElectronicos'
            ? normalizarCorreos(arr)
            : arr;
        if (valorFinal.length === 0) return;
        setByPath(payload, mapping.path, valorFinal);
        break;
      }
      default: {
        const str = formatCellValue(rawValue);
        if (!str) return;
        setByPath(payload, mapping.path, str);
        break;
      }
    }
  });

  setByPath(payload, 'oficio.tipoOficio', tipoOficio);

  // El default "CONGELAR" solo aplica a EMBARGO. En ALCANCE la plantilla sí
  // trae la columna "TIPO DE APLICACIÓN" (en DESEMBARGO no existe), así que un
  // valor explícito de esa columna se respeta y lo único que se elimina es el
  // relleno automático. Se resuelve DESPUÉS del mapeo de columnas para tener ya
  // el valor de la fila cargado.
  setByPath(
    payload,
    'infoCliente.tipoAplicacion',
    normalizarTipoAplicacion(tipoOficio, payload.infoCliente?.tipoAplicacion),
  );

  setByPath(payload, 'oficio.fechaHoraProcesamientoOficio', fechaProcesamiento);
  setByPath(
    payload,
    'infoCliente.fechaHoraRecepcionCorreo',
    fechaProcesamiento,
  );

  return payload;
}
