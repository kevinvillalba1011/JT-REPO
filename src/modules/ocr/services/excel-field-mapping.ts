/**
 * Mapeo de encabezados de las plantillas Excel (EMBARGO, DESEMBARGO, ALCANCE)
 * hacia las rutas del JSON final anidado (mismo formato que el perfil davibank).
 */

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
    path: 'demandados[0].tipoAplicacion',
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
    path: 'demandados[0].cuentas[0].productosFuturo',
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
  'OFICIO DE EMBARGO A DESEMBARGAR': {
    path: 'oficio.oficioEmbargoADesembargar',
    type: 'string',
  },
  'RADICADO OFICIO DE EMBARGO A DESEMBARGAR': {
    path: 'oficio.radicadoOficioADesembargar',
    type: 'string',
  },
};

/** Tipos de oficio soportados, identificados por el nombre de la hoja del Excel. */
export const SUPPORTED_TIPOS_OFICIO = ['EMBARGO', 'DESEMBARGO', 'ALCANCE'];

/** Estructura por defecto del JSON final, siguiendo la convención del perfil davibank. */
export function buildDefaultPayload(): Record<string, any> {
  return {
    oficio: {
      tipoOficio: '0',
      nombreOficioInicial: '0',
      nombreOficioFinal: '0',
      oficioEmbargoADesembargar: '0',
      radicadoOficioADesembargar: '0',
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
            productosFuturo: '0',
          },
        ],
        tipoAplicacion: '0',
        porcentajeAEmbargar: '0',
        valorEmbargo: 0,
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
      tipoRespuesta: '0',
      vinculoCliente: '0',
    },
  };
}

function normalizeHeader(header: unknown): string {
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
        const num = Number(String(rawValue).replace(/[^\d.-]/g, ''));
        if (isNaN(num)) return;
        setByPath(payload, mapping.path, num);
        break;
      }
      case 'array': {
        const arr = String(rawValue)
          .split(/[,;]/)
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
        if (arr.length === 0) return;
        setByPath(payload, mapping.path, arr);
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
  setByPath(payload, 'oficio.fechaHoraProcesamientoOficio', fechaProcesamiento);
  setByPath(
    payload,
    'infoCliente.fechaHoraRecepcionCorreo',
    fechaProcesamiento,
  );

  return payload;
}
