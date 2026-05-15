import { SchemaType } from '@google/generative-ai';
import { TenantProfile } from '../interfaces/tenant-profile.interface';

export const DavibankProfile: TenantProfile = {
  id: 'davibank',
  identifierKey: 'demandados.0.numeroId',
  clientFields: [
    'oficio.tipoProceso',
    'oficio.tipoOficio',
    'oficio.nombreOficioInicial',
    'oficio.nombreOficioFinal',
    'oficio.numeroRadicado',
    'oficio.oficioEmbargoADesembargar',
    'oficio.radicadoOficioADesembargar',
    'oficio.fechaHoraProcesamientoOficio',
    'oficio.observaciones',
    'oficio.tipoRequerimiento',
    'oficio.tipoRequerimientoInembargable',
    'oficio.tipoLimiteInembargabilidad',
    'demandados[0].tipoId',
    'demandados[0].numeroId',
    'demandados[0].nombre',
    'demandados[0].cuentas[0].productosAEmbargar',
    'demandados[0].cuentas[0].numeroCuentaEspecifica',
    'demandados[0].cuentas[0].productosAFuturo',
    'demandados[0].porcentajeAEmbargar',
    'demandados[0].valorEmbargo',
    'demandantes[0].tipoId',
    'demandantes[0].numeroId',
    'demandantes[0].nombre',
    'ente.nombreSecretarioFuncionario',
    'ente.nombreEnteEmbargante',
    'ente.ciudad',
    'ente.correosElectronicos',
    'ente.linkColocacionRespuesta',
    'infoCliente.fechaHoraRecepcionCorreo',
    'infoCliente.tipoDocumentoRecibidoEmail',
    'infoCliente.codigoAlcance',
    'infoCliente.codigoAplicacion',
    'infoCliente.tipoAplicacion',
    'infoCliente.tipoRespuesta',
    'infoCliente.vinculoCliente',
    'ruta_archivo',
  ],
  nonClientFields: [
    'oficio.tipoProceso',
    'oficio.tipoOficio',
    'oficio.nombreOficioInicial',
    'oficio.nombreOficioFinal',
    'oficio.numeroRadicado',
    'oficio.observaciones',
    'demandados[0].tipoId',
    'demandados[0].numeroId',
    'demandados[0].nombre',
    'ente.nombreEnteEmbargante',
    'ente.ciudad',
  ],

  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      oficio: {
        type: SchemaType.OBJECT,
        properties: {
          tipoProceso: {
            type: SchemaType.STRING,
            description: 'JUDICIAL o COACTIVO.',
          },
          tipoOficio: {
            type: SchemaType.STRING,
            description: 'EMBARGO, DESEMBARGO o ALCANCE O REQUERIMIENTO.',
          },
          nombreOficioInicial: {
            type: SchemaType.STRING,
            description:
              'Título o nombre del documento u oficio inicial (Ej: RESOLUCION NO. 1128). Máximo 40 caracteres.',
          },
          nombreOficioFinal: {
            type: SchemaType.STRING,
            description:
              'Título o nombre del documento u oficio final (Ej: RESOLUCION NO. 3511). Máximo 40 caracteres.',
          },
          numeroRadicado: {
            type: SchemaType.STRING,
            description:
              'Número principal de identificación del acto administrativo actual. Máximo 23 caracteres numéricos. NO usar números de resoluciones anteriores citadas como referencia.',
          },
          oficioEmbargoADesembargar: {
            type: SchemaType.STRING,
            description:
              'En DESEMBARGO, número de oficio a dejar sin efecto. Máximo 40 caracteres.',
          },
          radicadoOficioADesembargar: {
            type: SchemaType.STRING,
            description:
              'En DESEMBARGO, radicado del embargo original. Máximo 23 caracteres.',
          },
          observaciones: {
            type: SchemaType.STRING,
            description:
              'Alertas encontradas: REITERACIÓN, SEGUNDO ALCANCE, PAGADOR, ALIMENTOS, DIVORCIO, NOMINA.',
          },
          tipoRequerimiento: {
            type: SchemaType.STRING,
            description:
              'ACTUALIZACIÓN, INFORMATIVO, REQUERIMIENTO, APERTURA DE INCIDENTE, SOLICITUD DE INFORMACIÓN, etc.',
          },
          tipoRequerimientoInembargable: {
            type: SchemaType.STRING,
            description:
              'Intención si el sujeto es inembargable: REITERACION, INCIDENTE, etc.',
          },
          tipoLimiteInembargabilidad: {
            type: SchemaType.STRING,
            description:
              'Texto del límite de inembargabilidad (Art. 837-1 ET, Decreto 379, Carta Circular SFC, etc.)',
          },
        },
        required: ['tipoOficio', 'numeroRadicado'],
      },
      demandados: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            tipoId: {
              type: SchemaType.STRING,
              description:
                'Tipo de identificación: C (Cédula), N (NIT), E (Extranjería), T (TI), P (Pasaporte). 1 carácter.',
            },
            numeroId: {
              type: SchemaType.STRING,
              description:
                'Número de identificación del demandado. Solo dígitos, sin puntos ni comas. Máximo 12 caracteres.',
            },
            nombre: {
              type: SchemaType.STRING,
              description:
                'Nombre completo del demandado. Máximo 50 caracteres.',
            },
            cuentas: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  productosAEmbargar: {
                    type: SchemaType.STRING,
                    description:
                      'Productos sobre los cuales recae la medida: AHORROS, CORRIENTES, CDT, TODOS.',
                  },
                  numeroCuentaEspecifica: {
                    type: SchemaType.STRING,
                    description:
                      'Número del producto específico sobre el cual se aplica la medida. Máximo 12 caracteres numéricos.',
                  },
                  productosAFuturo: {
                    type: SchemaType.STRING,
                    description:
                      'SI o NO si el oficio menciona embargar productos futuros.',
                  },
                },
              },
            },
            porcentajeAEmbargar: {
              type: SchemaType.STRING,
              description:
                'Porcentaje solicitado. Solo el número, sin signo ni puntos ni comas.',
            },
            valorEmbargo: {
              type: SchemaType.NUMBER,
              description:
                'Valor o monto del embargo solicitado. Número entero sin puntos ni comas.',
            },
          },
          required: ['tipoId', 'numeroId', 'nombre'],
        },
      },
      demandantes: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            tipoId: {
              type: SchemaType.STRING,
              description: 'Tipo de identificación: C, N, E, T, P. 1 carácter.',
            },
            numeroId: {
              type: SchemaType.STRING,
              description:
                'Número de identificación del demandante. Solo dígitos. Máximo 12 caracteres.',
            },
            nombre: {
              type: SchemaType.STRING,
              description:
                'Nombre del demandante o accionante. Máximo 25 caracteres.',
            },
          },
          required: ['tipoId', 'numeroId', 'nombre'],
        },
      },
      ente: {
        type: SchemaType.OBJECT,
        properties: {
          nombreSecretarioFuncionario: {
            type: SchemaType.STRING,
            description:
              'Nombre del secretario, encargado o persona que firma el documento.',
          },
          nombreEnteEmbargante: {
            type: SchemaType.STRING,
            description:
              'Nombre de la entidad que emite la orden (DIAN, JUZGADO, GOBERNACION). Máximo 40 caracteres.',
          },
          ciudad: {
            type: SchemaType.STRING,
            description: 'Ciudad en la cual se emite el documento u oficio.',
          },
          correosElectronicos: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
              'Correos electrónicos válidos encontrados en el documento para respuesta.',
          },
          linkColocacionRespuesta: {
            type: SchemaType.STRING,
            description:
              'Link o dirección física en la cual se debe cargar o remitir la respuesta.',
          },
        },
      },
      infoCliente: {
        type: SchemaType.OBJECT,
        properties: {
          tipoDocumentoRecibidoEmail: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
              'Clasificación: LISTADO, MASIVO, DUPLICADO, INEMBARGABLE, TUTELA, etc.',
          },
          codigoAlcance: {
            type: SchemaType.STRING,
            description: 'Código de alcance según listado del banco.',
          },
          codigoAplicacion: {
            type: SchemaType.STRING,
            description:
              'Código de aplicación según listado del banco. Máximo 2 caracteres.',
          },
          tipoAplicacion: {
            type: SchemaType.STRING,
            description:
              'CONGELAR (Mantener, Bloquear) o DEBITAR (Consignar, Dejar a disposición).',
          },
          tipoRespuesta: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['Email', 'Fisico', 'Link'],
            description:
              'Tipo de respuesta esperado. Si no se especifica "Fisico" o "Link", seleccionar SIEMPRE "Email".',
          },
          vinculoCliente: {
            type: SchemaType.STRING,
            description:
              'Vínculo del cliente con el proceso o relación con el demandado.',
          },
        },
        required: ['tipoRespuesta'],
      },
      ruta_archivo: {
        type: SchemaType.STRING,
        description: 'Ruta completa del archivo procesado en el sistema.',
      },
    },
    required: ['oficio', 'demandados', 'demandantes', 'ente', 'infoCliente'],
  },

  promptTemplate: `
    Eres un asistente EXPERTO operando en el sistema de embargos de DAVIBANK.
    Extraerás información de documentos jurídicos colombianos (ej. oficios, embargos, desembargos).
    Debes emitir estricta y únicamente un objeto JSON con la estructura anidada descrita a continuación.

    --- ESTRUCTURA DEL JSON DE SALIDA ---
    El resultado DEBE ser un objeto JSON con estas secciones:

    1. "oficio": Información general del proceso y del oficio actual.
    2. "demandados": ARRAY de objetos, UNO POR CADA demandado encontrado en el documento.
       Cada demandado debe tener: tipoId, numeroId, nombre, cuentas (ARRAY), porcentajeAEmbargar, valorEmbargo.
       Si hay múltiples demandados, incluye todos en el array.
       Si no se especifican cuentas para un demandado, el array "cuentas" puede estar vacío [].
    3. "demandantes": ARRAY de objetos, UNO POR CADA demandante/accionante encontrado.
       Cada uno con: tipoId, numeroId, nombre.
    4. "ente": Información del ente embargante (nombreSecretarioFuncionario, nombreEnteEmbargante, ciudad, correosElectronicos como ARRAY, linkColocacionRespuesta).
    5. "infoCliente": Información del cliente (fechaHoraRecepcionCorreo, tipoDocumentoRecibidoEmail como ARRAY, codigoAlcance, codigoAplicacion, tipoAplicacion, tipoRespuesta, vinculoCliente).
    6. "ruta_archivo": Ruta completa del archivo procesado.

    --- REGLAS DE ORO DE CLASIFICACIÓN ---
    Para determinar 'oficio.tipoOficio', utiliza estas señales semánticas:
    1. EMBARGO: Busca "decretar el embargo", "limitarse a la suma", "remante", o "perfeccionamiento".
    2. DESEMBARGO: Prioridad alta. Busca "cancelar el embargo", "levántese la medida", "terminación de proceso" o "dejar sin efectos".
    3. ALCANCE O REQUERIMIENTO: Busca "reiterar oficio", "informar cumplimiento", "orden impartida", "traslado de títulos" o "poner a disposición".

    --- REGLAS ESTRICTAS DE EXTRACCIÓN Y LIMPIEZA ---
    - NÚMEROS DE IDENTIFICACIÓN: Remover formato. Extraer exclusivamente dígitos. Truncar si supera 12 caracteres.
    - VALOR EMBARGO: Limpiar separadores, obtener solo el valor bruto numérico.
    - NÚMERO DE RADICADO: Solo números. Rellenar ceros a la izquierda si es corto. Máximo 23 caracteres. CRÍTICO: Si el texto cita una resolución anterior y luego define la resolución actual, el radicado es SIEMPRE la resolución actual.
    - CUENTAS ESPECÍFICAS: Limpiar guiones o espacios. Máximo 12 caracteres numéricos.
    - TIPO ID: 1 solo carácter (C, N, E, T, P).
    - CORREOS ELECTRÓNICOS: Extraer todas las direcciones válidas que contengan @ como ARRAY.
    - NOMBRES: Demandados máximo 50 caracteres, demandantes máximo 25 caracteres, entes máximo 40 caracteres.
    - PORCENTAJE: Solo el número, sin signo %.
    - TIPO RESPUESTA: Priorizar "Email" si existe un correo en el texto o si no se especifica método físico/link.
    - DESEMBARGOS: No extraigas valores de embargo ni cuentas si el documento es un levantamiento de medida.

    --- ESTRUCTURA DE TEXTO A PROCESAR (DESDE OCR) ---
    {{text}}
  `,
};
