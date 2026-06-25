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
            format: 'enum',
            enum: ['EMBARGO', 'DESEMBARGO', 'ALCANCE'],
            description:
              'Clasifica el oficio en EXACTAMENTE uno de estos 3 valores, sin calificadores ni sufijos adicionales.',
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
              'Si dentro del oficio se encuentra una o más de estas palabras claves exactas: Nomina, Salario, Cesantías, Empleado, Pagador, Quinta parte, Devengar, Devengue, 5 parte, Honorarios, Ingresos, MLV, Prima, Sueldo, Reiteración, Alcance, Incidente, Requerimiento, Requerirlos, Requerir, Requiere, Informe, Información, Informen, Desacato, Tutela, Derecho, Petición, Defensoría, Sanción, Fiduciaria, Inmobiliario, Inmueble, Bienes, vehículo, Solicitud de Información, Certificado, certificación. Se deben capturar usando EXACTAMENTE la misma palabra de esta lista y concatenarlas separadas por comas. Si no se encuentra ninguna, usar "0".',
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
                'Información que trae el documento, la cual puede encontrarse también con los títulos Resolución, Expediente, Radicado, Proceso o Número de Proceso. Dato numérico, máximo 23 caracteres, sin puntos ni comas. Ejemplo: "68001400300520240075800". En DESEMBARGO, si se citan dos resoluciones (la del embargo original y la del desembargo), usar SIEMPRE la del desembargo — la del embargo original va en oficioEmbargoADesembargar, no acá.',
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
                    format: 'enum',
                    enum: ['AHORROS', 'CORRIENTES', "CDT'S", 'TODOS'],
                    description:
                      'Productos sobre los cuales recae la medida de embargo. "TODOS" si recae sobre más de un tipo de cuenta a la vez.',
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
            format: 'enum',
            enum: ['JUDICIAL', 'COACTIVO'],
            description:
              'Si dice JUZGADO es JUDICIAL; en cualquier otro caso (incluido EJECUTIVO) es COACTIVO.',
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
              'SIEMPRE debe quedar en "0". NUNCA llenar con el link de verificación del documento (ej. URL de firmaelectronica.ramajudicial.gov.co) ni con ninguna otra URL, dirección física o texto. Valor fijo obligatorio: "0".',
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
          // TODO: codigoAlcance y codigoAplicacion solo aplica para embargos y debo ajustarlo
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
              'Si dentro del oficio se encuentra las palabras claves exactas "Mantener los recursos en la cuenta", "Congelar", "Congelar Recursos" o "Bloquear" se debe interpretar como "CONGELAR". Si dentro del oficio se encuentra las palabras claves exactas "Consignar", "Debitar" o "Dejar a disposicion" se debe interpretar como "DEBITAR". de lo contrario se debe dejar "0".',
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

    --- BLOQUE 1: REGLA ANTI-ALUCINACIÓN Y FALLBACK (OBLIGATORIA) ---
    Extrae únicamente información que esté LITERALMENTE en el texto del documento.
    Si un dato no aparece explícitamente, NUNCA lo inventes, asumas ni infieras.
    En su lugar, rellena con el valor de fallback: "0" para campos de texto,
    el número 0 para campos numéricos, [] para arrays sin elementos detectados.
    NO uses null ni strings vacíos (""). Es preferible dejar un campo en su
    fallback que llenarlo con un valor inventado o probable.

    --- BLOQUE 2: ESTRUCTURA DEL JSON DE SALIDA ---
    El resultado DEBE ser un objeto JSON con estas secciones:

     1. "oficio": Información general del proceso y del oficio actual (debe incluir cuentaDepositoJudicial, nombreBancoDepositoJudicial).
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

    --- BLOQUE 3: CLASIFICACIONES (listas cerradas) ---
    - TIPO OFICIO (oficio.tipoOficio): clasifica usando estas señales semánticas:
      1. EMBARGO: cuando cita "EMBARGO", "SECUESTRO", "BLOQUEO RETENCION", "MEDIDA CAUTELAR", o "LIBRAR MANDAMIENTO DE PAGO".
      2. DESEMBARGO: Prioridad alta. Cuando cita "DESEMBARGO", "LEVANTAMIENTO", "DEJAR SIN EFECTO", "LIBERACION", "CANCELACION", o "SUSPENDER".
      3. ALCANCE: cuando cita "REITERACION", "REQUERIR", "MANTENIMIENTO", "OFICIAR", "INCIDENTE", "SANCION", "DESACATO", "NOTIFICAR", o "AMPLIAR".
      4. CONFUSIÓN/AMBIGÜEDAD: Si aparecen palabras clave tanto de EMBARGO como de DESEMBARGO y resulta confuso o contradictorio determinar el objetivo principal, clasifícalo OBLIGATORIAMENTE como "ALCANCE".
      Si clasificas como DESEMBARGO: demandados[].valorEmbargo, porcentajeAEmbargar, cuentas y productosFuturo deben quedar en su fallback (0, "0", [] o "NO" según corresponda) — no extraigas datos reales del embargo histórico que se está levantando.
    - TIPO PROCESO (ente.tipoProceso): "JUDICIAL" si el documento menciona JUZGADO; en cualquier otro caso (incluido EJECUTIVO) es "COACTIVO".
    - TIPO REQUERIMIENTO (oficio.tipoRequerimiento): clasifica en una de estas opciones exactas: ACTUALIZACIÓN, INFORMATIVO, REQUERIMIENTO, REQUERIMIENTO POR SEGUNDA O TERCERA VEZ, APERTURA DE INCIDENTE, SOLICITUD DE INFORMACIÓN, PEGAR, DESPEGAR. Si no hay, usar "0".
    - TIPO DOCUMENTO RECIBIDO EMAIL (infoCliente.tipoDocumentoRecibidoEmail): clasifica dentro de: LISTADO, MASIVO, DUPLICADO, INEMBARGABLE, DERECHO DE PETICIÓN, LEY 1116, FIDUCIARIA, TUTELA, REQUERIMIENTO SUPER, OTRAS ÁREAS.
    - TIPO ID (demandados[].tipoId, demandantes[].tipoId): 1 solo carácter. CC o Cédula de Ciudadanía → "C", NIT → "N", TI → "T", Extranjería → "E", Pasaporte → "P".
    - TIPO RESPUESTA (infoCliente.tipoRespuesta): prioriza "Email" si existe un correo en el texto o si no se especifica método físico/link.
    - PRODUCTOS A FUTURO (demandados[].productosFuturo): "SI" si el oficio indica embargar productos futuros, "NO" si lo descarta explícitamente, "0" si no se menciona en absoluto.

    --- BLOQUE 4: REGLAS POR CAMPO ---
    oficio:
    - NOMBRE OFICIO FINAL (oficio.nombreOficioFinal): Construir con la siguiente estructura estricta: "{numeroOficio} DEL {fechaOficioDDMMAA} {MMDD}{consecutivo4Digitos}". El numeroOficio se busca SOLO bajo etiquetas explícitas como "EXPEDIENTE", "Exp.", "OFICIO N", "OFICIO No." o "COMUNICADO No." (prioridad: 1) EXPEDIENTE, 2) OFICIO, 3) COMUNICADO). IMPORTANTE: extraer SOLO el número inmediato después de la etiqueta, SIN incluir el año ni texto adicional. Ejemplos: "OFICIO N 00906 de 2025" → numeroOficio = "00906" (NO "009062025"); "EXPEDIENTE 4686-2022" → numeroOficio = "46862022" (guiones se eliminan); "COMUNICADO No. 12345" → numeroOficio = "12345". CRÍTICO: numeroOficio NUNCA debe ser un número de RESOLUCIÓN (ni la que ordena embargo, ni la que ordena desembargo). Si no existe una etiqueta EXPEDIENTE/OFICIO/COMUNICADO separada de las resoluciones, usar "0". Máximo 23 dígitos, solo números. Extraer la fecha del oficio o documento y formatearla como DDMMAA (6 dígitos). Los últimos 8 caracteres (4 dígitos día-mes + 4 dígitos consecutivo) se completan en post-procesamiento. Ejemplo: "00906 DEL 290925 00000000". Si no se encuentra número de oficio, usar "0". Si no se encuentra fecha, usar "000000".
    - OFICIO Y RADICADO A DESEMBARGAR (oficio.oficioEmbargoADesembargar y oficio.radicadoOficioADesembargar): En DESEMBARGO, ambos campos comparten EL MISMO número: el del oficio, resolución o acto administrativo ORIGINAL que ordenó el embargo y que ahora se deja sin efecto. Extráelo UNA sola vez y úsalo en los dos campos. Extraer SOLAMENTE los dígitos, sin fechas ni texto adicional ni palabras como "RESOLUCION NO.", "OFICIO", "DEL". Ejemplo: si el texto dice "dejar sin efecto el oficio 1128 del 26 de febrero de 2025", capturar únicamente "1128" en ambos campos. Máximo 23 caracteres numéricos. Si no hay, usar "0".
    - CUENTA DEPOSITO JUDICIAL (oficio.cuentaDepositoJudicial): Extraer la cuenta de depósito judicial (suele estar asociada a la frase "depósito judicial"). Numérica, máximo 12 caracteres. Si no se encuentra, usar "0".
    - NOMBRE BANCO DEPOSITO JUDICIAL (oficio.nombreBancoDepositoJudicial): Extraer el nombre de la entidad bancaria asignada para los depósitos judiciales si se menciona (ej. "BANCO AGRARIO..."). Alfanumérico, máximo 40 caracteres, siempre en MAYÚSCULAS. Si no se encuentra, usar "0".
    - OBSERVACIONES (oficio.observaciones): Si dentro del oficio se encuentra una o más de estas palabras clave exactas: Nomina, Salario, Cesantías, Empleado, Pagador, Quinta parte, Devengar, Devengue, 5 parte, Honorarios, Ingresos, MLV, Prima, Sueldo, Reiteración, Alcance, Incidente, Requerimiento, Requerirlos, Requerir, Requiere, Informe, Información, Informen, Desacato, Tutela, Derecho, Petición, Defensoría, Sanción, Fiduciaria, Inmobiliario, Inmueble, Bienes, vehículo, Solicitud de Información, Certificado o certificación; captúralas usando EXACTAMENTE la misma palabra de esta lista y concaténalas separadas por comas (ej. "Nomina, Pagador, Información"). Si no se encuentra ninguna, usar "0".

    demandados:
    - NÚMERO DE RADICADO (demandados[].numeroRadicado): Información que trae el documento, la cual puede encontrarse también con los títulos Resolución, Expediente, Radicado, Proceso o Número de Proceso. Dato numérico, máximo 23 caracteres, sin puntos ni comas. Ejemplo: "68001400300520240075800". Si el texto cita más de un número bajo estos títulos (ej. una resolución anterior y luego la actual), usa SIEMPRE la actual/vigente. En DESEMBARGO específicamente, si el documento cita la resolución que ordenó el embargo original y la resolución que ordena el desembargo, usa SIEMPRE la del desembargo — la del embargo original va en oficioEmbargoADesembargar, no acá. Si no se encuentra, usar "0".
    - VALOR EMBARGO (demandados[].valorEmbargo): Limpiar separadores, obtener solo el valor bruto numérico. Si no se encuentra, retornar el número 0.
    - PRODUCTOS A EMBARGAR (demandados[].cuentas[].productosAEmbargar): Información que trae el documento indicando sobre cuáles productos recae la medida de embargo. Si la medida recae sobre CUENTAS DE AHORROS, CORRIENTES Y CDT'S (más de un tipo de cuenta), indicar "TODOS". Si recae solo sobre CUENTAS DE AHORRO, indicar "AHORROS". Si recae solo sobre CUENTAS CORRIENTES, indicar "CORRIENTES". Si recae solo sobre CDT'S, indicar "CDT'S".
    - CUENTAS ESPECÍFICAS (demandados[].cuentas[].numeroCuenta): Limpiar guiones o espacios. Máximo 12 caracteres numéricos. Si no se encuentra, usar "0".

    ente:
    - CORREOS ELECTRÓNICOS (ente.correosElectronicos): Extraer TODAS las direcciones válidas que contengan @ como ARRAY. Es OBLIGATORIO extraer el correo del remitente (ej. Juzgado o entidad que emite el oficio), que suele ubicarse en el encabezado o al final del documento. Si no hay, retornar [].
    - LINK COLOCACION RESPUESTA (ente.linkColocacionRespuesta): SIEMPRE debe quedar en "0". NUNCA llenarlo con el link de verificación del documento (ej. URL de firmaelectronica.ramajudicial.gov.co) ni con ninguna otra URL, dirección física o texto. Valor fijo obligatorio: "0".

    --- BLOQUE 5: LIMPIEZA DE FORMATO TRANSVERSAL ---
    - NÚMEROS DE IDENTIFICACIÓN: Remover formato. Extraer exclusivamente dígitos. Truncar si supera 12 caracteres.
    - NOMBRES: Demandados máximo 50 caracteres, demandantes máximo 25 caracteres, entes máximo 40 caracteres.
    - PORCENTAJE (demandados[].porcentajeAEmbargar): Solo el número, sin signo %, sin puntos ni comas. Si no hay, usar "0".

    --- ESTRUCTURA DE TEXTO A PROCESAR (DESDE OCR) ---
    {{text}}
  `,
};
