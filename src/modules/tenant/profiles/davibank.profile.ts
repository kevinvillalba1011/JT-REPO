import { SchemaType } from '@google/generative-ai';
import { TenantProfile } from '../interfaces/tenant-profile.interface';

export const DavibankProfile: TenantProfile = {
  id: 'davibank',
  identifierKey: 'demandados.0.numeroId',
  clientFields: [
    'oficio.tipoOficio',
    'oficio.nombreOficioInicial',
    'oficio.nombreOficioFinal',
    'oficio.oficioEmbargoADesembargar',
    'oficio.radicadoOficioADesembargar',
    'oficio.fechaHoraProcesamientoOficio',
    'oficio.observaciones',
    'oficio.tipoRequerimiento',
    'oficio.tipoRequerimientoInembargable',
    'oficio.tipoLimiteInembargabilidad',
    'oficio.rutaPdf',
    'oficio.cuentaDepositoJudicial',
    'oficio.nombreBancoDepositoJudicial',
    'demandados[0].tipoId',
    'demandados[0].numeroId',
    'demandados[0].numeroRadicado',
    'demandados[0].nombre',
    'demandados[0].cuentas[0].productosAEmbargar',
    'demandados[0].cuentas[0].numeroCuenta',
    'demandados[0].productosFuturo',
    'infoCliente.tipoAplicacion',
    'demandados[0].porcentajeAEmbargar',
    'demandados[0].valorEmbargo',
    'demandantes[0].tipoId',
    'demandantes[0].numeroId',
    'demandantes[0].nombre',
    'ente.nombreSecretarioFuncionario',
    'ente.nombreEnteEmbargante',
    'ente.ciudad',
    'ente.tipoProceso',
    'ente.correosElectronicos',
    'ente.linkColocacionRespuesta',
    'infoCliente.fechaHoraRecepcionCorreo',
    'infoCliente.tipoDocumentoRecibidoEmail',
    'infoCliente.codigoAlcance',
    'infoCliente.codigoAplicacion',
    'infoCliente.tipoRespuesta',
    'infoCliente.vinculoCliente',
  ],
  nonClientFields: [
    'oficio.tipoOficio',
    'oficio.nombreOficioInicial',
    'oficio.nombreOficioFinal',
    'oficio.observaciones',
    'demandados[0].tipoId',
    'demandados[0].numeroId',
    'demandados[0].numeroRadicado',
    'demandados[0].nombre',
    'ente.nombreEnteEmbargante',
    'ente.ciudad',
    'ente.tipoProceso',
  ],

  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      oficio: {
        type: SchemaType.OBJECT,
        properties: {
          tipoOficio: {
            type: SchemaType.STRING,
            description: 'EMBARGO, DESEMBARGO o ALCANCE.',
          },
          nombreOficioFinal: {
            type: SchemaType.STRING,
            description:
              'Nombre construido del oficio. Estructura: {numeroOficio} DEL {fechaOficioDDMMAA} {MMDD}{consecutivo4Digitos}. Ejemplo: 00906 DEL 290925 00000000. El numeroOficio viene de la etiqueta EXPEDIENTE, OFICIO o COMUNICADO — extraer SOLO el número inmediato, SIN el año ("OFICIO N 00906 de 2025" → "00906", NO "009062025"). NUNCA usar números de RESOLUCIÓN. Si no hay etiqueta EXPEDIENTE/OFICIO/COMUNICADO, usar "0". Solo dígitos, máximo 23. La fechaOficio es DDMMAA. Los últimos 8 caracteres se completan en post-procesamiento. Máximo 40 caracteres.',
          },
          oficioEmbargoADesembargar: {
            type: SchemaType.STRING,
            description:
              'En DESEMBARGO, número EXCLUSIVO del oficio a dejar sin efecto. Extraer SOLAMENTE los dígitos del número de oficio, resolución o acto administrativo. NO incluir fechas ni texto adicional. Ejemplo correcto: "1128". Ejemplo incorrecto: "1128 DEL 260225" o "RESOLUCION NO. 1128". Máximo 23 caracteres numéricos.',
          },
          radicadoOficioADesembargar: {
            type: SchemaType.STRING,
            description:
              'En DESEMBARGO: número de la resolución o acto administrativo que ORDENÓ EL EMBARGO original que ahora se está levantando. Es el mismo número que oficioEmbargoADesembargar. Solo dígitos, sin puntos ni comas. Máximo 23 caracteres numéricos. Si no se encuentra, usar "0".',
          },
          observaciones: {
            type: SchemaType.STRING,
            description:
              'Si el texto contiene una o más de estas palabras clave: Nomina, Salario, Cesantías, Empleado, Pagador, Quinta parte, Devengar, Devengue, 5 parte, Honorarios, Ingresos, MLV, Prima, Sueldo, Reiteración, Alcance, Incidente, Requerimiento, Requerirlos, Requerir, Requiere, Informe, Información, Informen, Desacato, Tutela, Derecho, Petición, Defensoría, Sanción, Fiduciaria, Inmobiliario, Inmueble, Bienes, vehículo, Solicitud de Información, Certificado, certificación. Se deben capturar y concatenar todas las que se encuentren separadas por comas. Si no se encuentra ninguna, usar "0".',
          },
          tipoRequerimiento: {
            type: SchemaType.STRING,
            description:
              'Clasificación del requerimiento: ACTUALIZACIÓN, INFORMATIVO, REQUERIMIENTO, REQUERIMIENTO POR SEGUNDA O TERCERA VEZ, APERTURA DE INCIDENTE, SOLICITUD DE INFORMACIÓN, PEGAR, DESPEGAR.',
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
          rutaPdf: {
            type: SchemaType.STRING,
            description: 'Ruta completa del archivo procesado en el sistema.',
          },
          cuentaDepositoJudicial: {
            type: SchemaType.STRING,
            description:
              'Número de cuenta de depósito judicial detectada en el oficio.',
          },
          nombreBancoDepositoJudicial: {
            type: SchemaType.STRING,
            description:
              'Nombre del banco para el depósito judicial (usualmente Banco Agrario).',
          },
        },
        required: [
          'tipoOficio',
          'nombreOficioFinal',
          'oficioEmbargoADesembargar',
          'radicadoOficioADesembargar',
          'observaciones',
          'tipoRequerimiento',
          'tipoRequerimientoInembargable',
          'tipoLimiteInembargabilidad',
          'rutaPdf',
          'cuentaDepositoJudicial',
          'nombreBancoDepositoJudicial',
        ],
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
            numeroRadicado: {
              type: SchemaType.STRING,
              description:
                'Número de resolución del proceso ACTUAL para este demandado. En DESEMBARGO: extraer el número de la RESOLUCIÓN QUE ORDENA EL DESEMBARGO (la nueva, no la del embargo anterior). Prioridad: 1) RESOLUCIÓN DE DESEMBARGO ACTUAL, 2) RADICADO, 3) PROCESO, 4) NÚMERO DE PROCESO. NUNCA usar el número de EXPEDIENTE (ese va en nombreOficioFinal) ni la resolución anterior de embargo (esa va en oficioEmbargoADesembargar). Máximo 23 caracteres numéricos.',
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
                  numeroCuenta: {
                    type: SchemaType.STRING,
                    description:
                      'Número del producto específico sobre el cual se aplica la medida. Máximo 12 caracteres numéricos.',
                  },
                },
                required: ['productosAEmbargar', 'numeroCuenta'],
              },
            },
            productosFuturo: {
              type: SchemaType.STRING,
              description:
                'Indicar estrictamente "SI" o "NO" si el oficio menciona embargar productos futuros. Va a nivel del demandado, NO dentro de cuentas.',
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
          required: [
            'tipoId',
            'numeroId',
            'numeroRadicado',
            'nombre',
            'cuentas',
            'productosFuturo',
            'porcentajeAEmbargar',
            'valorEmbargo',
          ],
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
          tipoProceso: {
            type: SchemaType.STRING,
            description:
              'Si dice JUZGADO es JUDICIAL, de lo contrario siempre COACTIVO (Ej: EJECUTIVO).',
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
        required: [
          'nombreSecretarioFuncionario',
          'nombreEnteEmbargante',
          'ciudad',
          'tipoProceso',
          'correosElectronicos',
          'linkColocacionRespuesta',
        ],
      },
      infoCliente: {
        type: SchemaType.OBJECT,
        properties: {
          tipoDocumentoRecibidoEmail: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
              'Clasificación del correo/documento recibido. Valores posibles: LISTADO, MASIVO, DUPLICADO, INEMBARGABLE, DERECHO DE PETICIÓN, LEY 1116, FIDUCIARIA, TUTELA, REQUERIMIENTO SUPER, OTRAS ÁREAS.',
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
          tipoRespuesta: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['Email', 'Fisico', 'Link'],
            description:
              'Tipo de respuesta esperado. Si no se especifica "Fisico" o "Link", seleccionar SIEMPRE "Email".',
          },
          tipoAplicacion: {
            type: SchemaType.STRING,
            description:
              'Informacion que trae el documento acorde a la instrucción del oficio y se debe interpretar de la siguiente manera: CONGELAR: Mantener los recursos en la cuenta, Congelar, Congelar Recursos, Bloquear. DEBITAR: Consignar, Debitar, Dejar a disposicion. Si no se encuentra ninguna de estas palabras clave, dejar "0".',
          },
          vinculoCliente: {
            type: SchemaType.STRING,
            description:
              'Vínculo del cliente con el proceso o relación con el demandado.',
          },
        },
        required: [
          'tipoDocumentoRecibidoEmail',
          'codigoAlcance',
          'codigoAplicacion',
          'tipoAplicacion',
          'tipoRespuesta',
          'vinculoCliente',
        ],
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

     1. "oficio": Información general del proceso y del oficio actual (debe incluir rutaPdf, cuentaDepositoJudicial, nombreBancoDepositoJudicial).
     2. "demandados": ARRAY de objetos, UNO POR CADA demandado encontrado en el documento.
        Cada demandado debe tener: tipoId, numeroId, numeroRadicado, nombre, cuentas (ARRAY con productosAEmbargar, numeroCuenta), productosFuturo, porcentajeAEmbargar, valorEmbargo.
        CRÍTICO — "productosFuturo" va a nivel del demandado, NO dentro de cada cuenta. Nombre exacto del campo en cuentas: "numeroCuenta" (NO "numeroCuentaEspecifica").
        Si hay múltiples demandados, incluye todos en el array. IMPORTANTE: Si un mismo demandado aparece múltiples veces pero asociado a resoluciones o radicados distintos, DEBES extraerlo como un objeto independiente por cada resolución diferente. No omitas ni agrupes demandados si sus números de radicado varían.
        Si no se especifican cuentas para un demandado, el array "cuentas" puede estar vacío [].
    3. "demandantes": ARRAY de objetos, UNO POR CADA demandante/accionante encontrado.
       Cada uno con: tipoId, numeroId, nombre.
    4. "ente": Información del ente embargante (nombreSecretarioFuncionario, nombreEnteEmbargante, ciudad, correosElectronicos como ARRAY, linkColocacionRespuesta, tipoProceso).
    5. "infoCliente": Información del cliente (fechaHoraRecepcionCorreo, tipoDocumentoRecibidoEmail como ARRAY, codigoAlcance, codigoAplicacion, tipoAplicacion, tipoRespuesta, vinculoCliente).
       tipoAplicacion va SIEMPRE en "infoCliente", NO en "demandados".

    --- REGLAS DE ORO DE CLASIFICACIÓN ---
    Para determinar 'oficio.tipoOficio', utiliza estas señales semánticas:
    1. EMBARGO: Busca "EMBARGO", "SECUESTRO", "BLOQUEO", "RETENCIÓN", "MEDIDA CAUTELAR", o "LIBRAR MANDAMIENTO DE PAGO".
    2. DESEMBARGO: Prioridad alta. Busca "DESEMBARGO", "LEVANTAMIENTO", "DEJAR SIN EFECTO", "LIBERACIÓN", "CANCELACIÓN", o "SUSPENDER".
    3. ALCANCE: Busca "REITERACIÓN", "REQUERIR", "MANTENIMIENTO", "OFICIAR", "INCIDENTE", "SANCIÓN", "DESACATO", "NOTIFICAR", o "AMPLIAR".
    4. CONFUSIÓN/AMBIGÜEDAD: Si en el documento aparecen palabras clave tanto de EMBARGO como de DESEMBARGO y resulta confuso o contradictorio determinar el objetivo principal, clasifícalo OBLIGATORIAMENTE como "ALCANCE".

    --- REGLAS ESTRICTAS DE EXTRACCIÓN Y LIMPIEZA ---
    - OBSERVACIONES: Si dentro del texto del oficio se encuentra una o más de estas palabras clave: Nomina, Salario, Cesantías, Empleado, Pagador, Quinta parte, Devengar, Devengue, 5 parte, Honorarios, Ingresos, MLV, Prima, Sueldo, Reiteración, Alcance, Incidente, Requerimiento, Requerirlos, Requerir, Requiere, Informe, Información, Informen, Desacato, Tutela, Derecho, Petición, Defensoría, Sanción, Fiduciaria, Inmobiliario, Inmueble, Bienes, vehículo, Solicitud de Información, Certificado o certificación; entonces se deben capturar TODAS las que se encuentren y concatenarlas separadas por comas (ej. "Nomina, Pagador, Información"). Si no se encuentra ninguna, usar "0".
    - TIPO PROCESO: Identificar si es "JUDICIAL", "COACTIVO" o "EJECUTIVO". Ubicarlo exclusivamente en "ente.tipoProceso". No debe ir en "oficio.tipoProceso".
    - VALORES POR DEFECTO O FALLBACK (OBLIGATORIO): Si cualquier campo de tipo texto o número (ej. observaciones, valorEmbargo, porcentajeAEmbargar, vinculoCliente, codigoAlcance, codigoAplicacion, oficioEmbargoADesembargar, etc.) no es encontrado, no aplica, o está vacío en el documento, se debe rellenar estrictamente con "0" (como string o número 0 según el tipo). NO uses null ni strings vacíos (""). Los arrays vacíos que no tengan elementos detectados se deben retornar como [] (arreglos vacíos normales).
    - NÚMEROS DE IDENTIFICACIÓN: Remover formato. Extraer exclusivamente dígitos. Truncar si supera 12 caracteres.
    - VALOR EMBARGO: Limpiar separadores, obtener solo el valor bruto numérico. Si no se encuentra, retornar el número 0.
    - NÚMERO DE RADICADO: Solo en demandados[].numeroRadicado. NO va en oficio. Para cada demandado, extraer el número de radicado del proceso con prioridad: 1) RESOLUCIÓN, 2) EXPEDIENTE, 3) RADICADO, 4) PROCESO, 5) NÚMERO DE PROCESO. Máximo 23 caracteres numéricos. CRÍTICO: Si el texto cita una resolución anterior y luego define la resolución actual, el radicado es SIEMPRE la resolución actual. Si no se encuentra, usar "0".
    - RADICADO OFICIO A DESEMBARGAR (radicadoOficioADesembargar): En desembargos, extraer el número de la RESOLUCIÓN QUE ORDENÓ EL EMBARGO original que se está levantando. Es el mismo número que oficioEmbargoADesembargar. Solo dígitos, sin puntos ni comas, máximo 23 caracteres. Si no hay, usar "0".
    - OFICIO EMBARGO A DESEMBARGAR (oficioEmbargoADesembargar): En desembargos, extraer SOLAMENTE el número del oficio, resolución o acto administrativo a dejar sin efecto. NO incluir fechas, texto adicional ni palabras como "RESOLUCION NO.", "OFICIO", "DEL". Solo dígitos. Ejemplo: si el texto dice "dejar sin efecto el oficio 1128 del 26 de febrero de 2025", capturar únicamente: "1128". Máximo 23 caracteres numéricos.
    - TIPO REQUERIMIENTO: Identificar si requiere atención diferente y clasificar en una de estas opciones exactas: ACTUALIZACIÓN, INFORMATIVO, REQUERIMIENTO, REQUERIMIENTO POR SEGUNDA O TERCERA VEZ, APERTURA DE INCIDENTE, SOLICITUD DE INFORMACIÓN, PEGAR, DESPEGAR. Si no hay, usar "0".
    - CUENTAS ESPECÍFICAS: Limpiar guiones o espacios. Máximo 12 caracteres numéricos. Si no se encuentra cuenta específica, usar "0".
    - CUENTA DEPOSITO JUDICIAL: Extraer la cuenta de depósito judicial (suele estar asociada a la frase "depósito judicial"). Debe ser numérica, de máximo 12 caracteres. Si no se encuentra, retornar "0".
    - NOMBRE BANCO DEPOSITO JUDICIAL: Extraer el nombre de la entidad bancaria asignada para los depósitos judiciales si se menciona (ej. "BANCO AGRARIO..."). Debe ser alfanumérico, de máximo 40 caracteres, y siempre en MAYÚSCULAS. Si no se encuentra, retornar "0".
    - PRODUCTOS A FUTURO (productosFuturo): Va a nivel del demandado, NO dentro de cuentas. Si el oficio indica embargar productos futuros, extraer estrictamente "SI". En caso contrario, extraer estrictamente "NO" (o "0" si no se menciona en absoluto).
    - TIPO DOCUMENTO RECIBIDO EMAIL: Clasificar el tipo de documento o correo dentro de las opciones permitidas: LISTADO, MASIVO, DUPLICADO, INEMBARGABLE, DERECHO DE PETICIÓN, LEY 1116, FIDUCIARIA, TUTELA, REQUERIMIENTO SUPER, OTRAS ÁREAS.
    - TIPO ID: 1 solo carácter. Si dice CC o Cédula de Ciudadanía usa "C", si dice NIT usa "N", si dice TI usa "T", si dice E usa "E", si dice P usa "P".
    - CORREOS ELECTRÓNICOS: Extraer todas las direcciones válidas que contengan @ como ARRAY. Si no hay, retornar [].
    - NOMBRES: Demandados máximo 50 caracteres, demandantes máximo 25 caracteres, entes máximo 40 caracteres.
    - PORCENTAJE: Solo el número, sin signo %. Si no hay, usar "0".
    - TIPO RESPUESTA: Priorizar "Email" si existe un correo en el texto o si no se especifica método físico/link.
    - DESEMBARGOS: No extraigas valores de embargo ni cuentas si el documento es un levantamiento de medida.
    - NOMBRE OFICIO FINAL (nombreOficioFinal): Construir con la siguiente estructura estricta: "{numeroOficio} DEL {fechaOficioDDMMAA} {MMDD}{consecutivo4Digitos}". El numeroOficio se busca SOLO bajo etiquetas explícitas como "EXPEDIENTE", "Exp.", "OFICIO N", "OFICIO No." o "COMUNICADO No." (prioridad: 1) EXPEDIENTE, 2) OFICIO, 3) COMUNICADO). IMPORTANTE: extraer SOLO el número inmediato después de la etiqueta, SIN incluir el año ni texto adicional. Ejemplos: "OFICIO N 00906 de 2025" → numeroOficio = "00906" (NO "009062025"); "EXPEDIENTE 4686-2022" → numeroOficio = "46862022" (guiones se eliminan); "COMUNICADO No. 12345" → numeroOficio = "12345". CRÍTICO: numeroOficio NUNCA debe ser un número de RESOLUCIÓN (ni la que ordena embargo, ni la que ordena desembargo). Si no existe una etiqueta EXPEDIENTE/OFICIO/COMUNICADO separada de las resoluciones, usar "0". Máximo 23 dígitos, solo números. Extraer la fecha del oficio o documento y formatearla como DDMMAA (6 dígitos). Los últimos 8 caracteres (4 dígitos día-mes + 4 dígitos consecutivo) se completan en post-procesamiento. Ejemplo: "00906 DEL 290925 00000000". Si no se encuentra número de oficio, usar "0". Si no se encuentra fecha, usar "000000".
    - NÚMERO DE RADICADO POR DEMANDADO (demandados[].numeroRadicado): Para cada demandado, extraer el número de la RESOLUCIÓN DEL PROCESO ACTUAL. En documentos de DESEMBARGO: tomar el número de la RESOLUCIÓN QUE ORDENA EL DESEMBARGO (la nueva, por ejemplo "3511 DEL 14 DE OCTUBRE DE 2025" → "3511"). NUNCA usar el número de EXPEDIENTE (ese es para nombreOficioFinal) ni la resolución anterior de embargo (esa va en oficioEmbargoADesembargar). Prioridad: 1) RESOLUCIÓN DE DESEMBARGO ACTUAL, 2) RADICADO, 3) PROCESO. Máximo 23 caracteres numéricos. Si no se encuentra, usar "0".

    --- ESTRUCTURA DE TEXTO A PROCESAR (DESDE OCR) ---
    {{text}}
  `,
};
