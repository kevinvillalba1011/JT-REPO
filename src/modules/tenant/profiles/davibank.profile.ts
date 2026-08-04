import { SchemaType } from '@google/generative-ai';
import { TenantProfile } from '../interfaces/tenant-profile.interface';

export const DavibankProfile: TenantProfile = {
  id: 'davibank',
  identifierKey: 'demandados.0.numeroId',
  clientFields: [
    'oficio.tipoOficio',
    'oficio.nombreOficioInicial',
    'oficio.nombreOficioFinal',
    'demandados[0].oficioEmbargoADesembargar',
    'demandados[0].radicadoADesembargar',
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
              'Nombre construido del oficio. Aplica a los 3 tipos de oficio (EMBARGO, DESEMBARGO y ALCANCE). Estructura: {numeroOficio} DEL {fechaOficioDDMMAA} {MMDD}{consecutivo4Digitos}. Ejemplo: 00906 DEL 290925 00000000. PISTA: tanto el numeroOficio como la fecha del oficio normalmente están en el ENCABEZADO del documento (parte superior) — buscalos ahí primero. El numeroOficio se toma por prioridad: 1) etiqueta EXPEDIENTE, OFICIO o COMUNICADO; 2) SOLO si ninguna de esas existe, se admite como reemplazo el número de RESOLUCIÓN, ACTO ADMINISTRATIVO, RADICADO o PROCESO. Extraer SOLO el número inmediato, SIN el año ("OFICIO N 00906 de 2025" → "00906", NO "009062025"). Si no hay ninguno, usar "0". OJO: este reemplazo por resolución es EXCLUSIVO de este campo — no se aplica a demandados[].oficioEmbargoADesembargar. Solo dígitos, máximo 23. La fechaOficio es DDMMAA. Los últimos 8 caracteres se completan en post-procesamiento. Máximo 40 caracteres.',
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
              format: 'enum',
              enum: ['C', 'N', 'E', 'T', 'P'],
              description:
                'Tipo de identificación, 1 sola letra: C = Cédula de Ciudadanía, N = NIT, E = Cédula de Extranjería, T = Tarjeta de Identidad, P = Pasaporte.',
            },
            numeroId: {
              type: SchemaType.STRING,
              description:
                'Número de identificación del demandado, TAL COMO aparece en el documento. Solo dígitos, sin puntos ni comas. Máximo 30 caracteres.',
            },
            numeroRadicado: {
              type: SchemaType.STRING,
              description:
                'Información que trae el documento, la cual puede encontrarse también con los títulos Resolución, Expediente, Radicado, Proceso o Número de Proceso. Dato numérico, máximo 23 caracteres, sin puntos ni comas. Ejemplo: "68001400300520240075800". En DESEMBARGO, si se citan dos resoluciones (la del embargo original y la del desembargo), usar SIEMPRE la del desembargo — la del embargo original va en radicadoADesembargar (o en oficioEmbargoADesembargar si viene bajo etiqueta de OFICIO), no acá.',
            },
            nombre: {
              type: SchemaType.STRING,
              description:
                'Nombre completo del demandado, TAL COMO aparece en el documento, sin truncar ni abreviar.',
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
              type: SchemaType.STRING,
              description:
                'Valor o monto del embargo solicitado. Transcribir LITERALMENTE el valor tal como aparece en el documento, con los mismos puntos, comas y el símbolo $ si lo tiene. NO convertir a número ni quitar separadores — el sistema hace esa conversión en post-procesamiento. Si no se encuentra, usar "0".',
            },
            oficioEmbargoADesembargar: {
              type: SchemaType.STRING,
              description:
                'Solo en DESEMBARGO: número EXACTO del OFICIO original que se deja sin efecto para ESTE demandado. Solo se acepta el número que aparezca bajo una etiqueta explícita de OFICIO o COMUNICADO (ej. "dejar sin efecto el oficio 1128" → "1128"). PROHIBIDO usar como reemplazo un número de RESOLUCIÓN, ACTO ADMINISTRATIVO, EXPEDIENTE, RADICADO o PROCESO: si no hay un número de OFICIO explícito, usar "0" (ese otro número va en radicadoADesembargar). Nota: si dejas "0" aquí, el sistema lo completa automáticamente en post-procesamiento con la fecha del oficio (o la fecha de procesamiento); vos igual devuelve "0" cuando no encuentres la etiqueta, no intentes rellenar la fecha vos mismo. Extraer SOLAMENTE los dígitos, sin fechas ni texto. Ejemplo incorrecto: "1128 DEL 260225" o "RESOLUCION NO. 1128". Máximo 23 caracteres numéricos.',
            },
            radicadoADesembargar: {
              type: SchemaType.STRING,
              description:
                'Solo en DESEMBARGO: número de la RESOLUCIÓN o acto administrativo que ordenó el embargo original que ahora se levanta para ESTE demandado. Es el campo complementario de oficioEmbargoADesembargar (que solo admite números de OFICIO): cuando el documento cita una resolución y no un oficio, el número va acá. Solo dígitos. Si no aplica o no se encuentra, usar "0".',
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
            'oficioEmbargoADesembargar',
            'radicadoADesembargar',
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
              format: 'enum',
              enum: ['C', 'N', 'E', 'T', 'P'],
              description:
                'Tipo de identificación, 1 sola letra: C = Cédula de Ciudadanía, N = NIT, E = Cédula de Extranjería, T = Tarjeta de Identidad, P = Pasaporte.',
            },
            numeroId: {
              type: SchemaType.STRING,
              description:
                'Número de identificación del demandante, TAL COMO aparece en el documento. Solo dígitos. Máximo 30 caracteres.',
            },
            nombre: {
              type: SchemaType.STRING,
              description:
                'Nombre del demandante o accionante, TAL COMO aparece en el documento, sin truncar ni abreviar.',
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
              'Nombre de la entidad que emite la orden (DIAN, JUZGADO, GOBERNACION), TAL COMO aparece en el documento, sin truncar ni abreviar.',
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
              'Correos electrónicos válidos encontrados en el documento para respuesta. Cada elemento del array debe contener ÚNICAMENTE la dirección (formato usuario@dominio.tld), en minúsculas y sin NINGÚN carácter adicional: sin viñetas ni guiones de lista ("•", "-", "–"), sin el prefijo "mailto:", sin etiquetas como "Correo:" o "E-mail:", sin delimitadores "<" ">" "(" ")" "[" "]", sin comillas, sin espacios y sin el punto o la coma que cierra la frase. Un elemento = una sola dirección: si varias vienen pegadas por comas, punto y coma o saltos de línea, sepáralas en elementos distintos. Si un fragmento no forma una dirección completa y válida, omítelo del array en lugar de incluirlo a medias.',
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
              'Si dentro del oficio se encuentra las palabras claves exactas "Mantener los recursos en la cuenta", "Congelar", "Congelar Recursos" o "Bloquear" se debe interpretar como "CONGELAR". Si dentro del oficio se encuentra las palabras claves exactas "Consignar", "Debitar" o "Dejar a disposicion" se debe interpretar como "DEBITAR". Si no aparece ninguna de esas palabras: en oficios de EMBARGO y ALCANCE se deja "CONGELAR" por defecto; en DESEMBARGO se deja "0".',
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
        Cada demandado debe tener: tipoId, numeroId, numeroRadicado, nombre, cuentas (ARRAY con productosAEmbargar, numeroCuenta), productosFuturo, porcentajeAEmbargar, valorEmbargo, oficioEmbargoADesembargar, radicadoADesembargar.
        CRÍTICO — "productosFuturo" va a nivel del demandado, NO dentro de cada cuenta. Nombre exacto del campo en cuentas: "numeroCuenta" (NO "numeroCuentaEspecifica").
        Si hay múltiples demandados, incluye todos en el array.
        CRÍTICO — NUNCA fusiones, agrupes ni deduplipiques demandados por su identidad (mismo nombre o mismo número de identificación). La unidad del array NO es "la persona": es CADA APARICIÓN de esa persona con datos propios. Si el MISMO demandado (mismo nombre y misma cédula/NIT) aparece varias veces asociado a datos distintos, DEBES emitir un objeto INDEPENDIENTE por cada aparición, repitiendo tipoId, numeroId y nombre en todos ellos. Cuenta como "datos distintos" cualquiera de estos:
          a) CUANTÍAS / VALORES de embargo distintos (ej. el documento lista para la misma persona $5.000.000 y $12.300.000, o un capital y unos intereses por separado, o un valor por cada proceso): un objeto por CADA cuantía, con su valorEmbargo propio. Este es el caso más frecuente y el que NO se debe colapsar: NUNCA sumes las cuantías, NUNCA te quedes solo con la mayor ni con la primera.
          b) resoluciones, radicados o números de proceso distintos;
          c) porcentajes a embargar distintos;
          d) oficios/radicados a desembargar distintos (en DESEMBARGO).
        Antes de cerrar el array, RECUENTA: la cantidad de objetos en "demandados" debe ser igual a la cantidad de apariciones con datos propios que trae el documento, no a la cantidad de personas distintas. Si el documento trae 1 persona con 3 cuantías, el array debe tener 3 objetos.
        Las cuentas bancarias SÍ se agrupan dentro del mismo demandado (van en su array "cuentas"): varias cuentas de una misma aparición NO generan objetos separados.
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
      Si clasificas como DESEMBARGO: demandados[].valorEmbargo, porcentajeAEmbargar, cuentas y productosFuturo deben quedar en su fallback ("0", [] o "NO" según corresponda) — no extraigas datos reales del embargo histórico que se está levantando. Las ÚNICAS excepciones son demandados[].oficioEmbargoADesembargar y demandados[].radicadoADesembargar, que SÍ deben extraerse en DESEMBARGO (ver BLOQUE 4).
      Al revés: demandados[].oficioEmbargoADesembargar y demandados[].radicadoADesembargar aplican EXCLUSIVAMENTE a DESEMBARGO. En EMBARGO y en ALCANCE ambos deben quedar en "0", aunque el documento mencione oficios o resoluciones previas.
    - TIPO PROCESO (ente.tipoProceso): "JUDICIAL" si el documento menciona JUZGADO; en cualquier otro caso (incluido EJECUTIVO) es "COACTIVO".
    - TIPO REQUERIMIENTO (oficio.tipoRequerimiento): clasifica en una de estas opciones exactas: ACTUALIZACIÓN, INFORMATIVO, REQUERIMIENTO, REQUERIMIENTO POR SEGUNDA O TERCERA VEZ, APERTURA DE INCIDENTE, SOLICITUD DE INFORMACIÓN, PEGAR, DESPEGAR. Si no hay, usar "0".
    - TIPO DOCUMENTO RECIBIDO EMAIL (infoCliente.tipoDocumentoRecibidoEmail): clasifica dentro de: LISTADO, MASIVO, DUPLICADO, INEMBARGABLE, DERECHO DE PETICIÓN, LEY 1116, FIDUCIARIA, TUTELA, REQUERIMIENTO SUPER, OTRAS ÁREAS.
    - TIPO ID (demandados[].tipoId, demandantes[].tipoId): 1 sola letra. Si el documento usa la forma larga, conviértela a la corta: "CC" o "Cédula de Ciudadanía" → "C", "NIT" → "N", "CE" o "Cédula de Extranjería" → "E", "TI" o "Tarjeta de Identidad" → "T", "PA" o "Pasaporte" → "P".
    - TIPO RESPUESTA (infoCliente.tipoRespuesta): prioriza "Email" si existe un correo en el texto o si no se especifica método físico/link.
    - PRODUCTOS A FUTURO (demandados[].productosFuturo): "SI" si el oficio indica embargar productos futuros, "NO" si lo descarta explícitamente, "0" si no se menciona en absoluto.

    --- BLOQUE 4: REGLAS POR CAMPO ---
    oficio:
    - NOMBRE OFICIO FINAL (oficio.nombreOficioFinal): Aplica a los TRES tipos de oficio (EMBARGO, DESEMBARGO y ALCANCE). Construir con la siguiente estructura estricta: "{numeroOficio} DEL {fechaOficioDDMMAA} {MMDD}{consecutivo4Digitos}". PISTA: tanto el numeroOficio como la fecha del oficio normalmente se encuentran en el ENCABEZADO del documento (parte superior) — buscalos ahí primero. El numeroOficio se busca por PRIORIDAD: 1) "EXPEDIENTE" o "Exp.", 2) "OFICIO N" / "OFICIO No.", 3) "COMUNICADO No.". IMPORTANTE: extraer SOLO el número inmediato después de la etiqueta, SIN incluir el año ni texto adicional. Ejemplos: "OFICIO N 00906 de 2025" → numeroOficio = "00906" (NO "009062025"); "EXPEDIENTE 4686-2022" → numeroOficio = "46862022" (guiones se eliminan); "COMUNICADO No. 12345" → numeroOficio = "12345". SOLO si el documento no trae ninguna de esas tres etiquetas, se admite como reemplazo el número de "RESOLUCIÓN", "ACTO ADMINISTRATIVO", "RADICADO" o "PROCESO". Si tampoco hay ninguno de esos, usar "0". CRÍTICO: este reemplazo por resolución/radicado es EXCLUSIVO de nombreOficioFinal — NO se aplica a demandados[].oficioEmbargoADesembargar, que solo admite números de OFICIO reales. Máximo 23 dígitos, solo números. Extraer la fecha del oficio o documento y formatearla como DDMMAA (6 dígitos). Los últimos 8 caracteres (4 dígitos día-mes + 4 dígitos consecutivo) se completan en post-procesamiento. Ejemplo: "00906 DEL 290925 00000000". Si no se encuentra fecha, usar "000000".
    - CUENTA DEPOSITO JUDICIAL (oficio.cuentaDepositoJudicial): Extraer la cuenta de depósito judicial (suele estar asociada a la frase "depósito judicial"). Numérica, máximo 12 caracteres. Si no se encuentra, usar "0".
    - NOMBRE BANCO DEPOSITO JUDICIAL (oficio.nombreBancoDepositoJudicial): Extraer el nombre de la entidad bancaria asignada para los depósitos judiciales si se menciona (ej. "BANCO AGRARIO..."). Alfanumérico, máximo 40 caracteres, siempre en MAYÚSCULAS. Si no se encuentra, usar "0".
    - OBSERVACIONES (oficio.observaciones): Si dentro del oficio se encuentra una o más de estas palabras clave exactas: Nomina, Salario, Cesantías, Empleado, Pagador, Quinta parte, Devengar, Devengue, 5 parte, Honorarios, Ingresos, MLV, Prima, Sueldo, Reiteración, Alcance, Incidente, Requerimiento, Requerirlos, Requerir, Requiere, Informe, Información, Informen, Desacato, Tutela, Derecho, Petición, Defensoría, Sanción, Fiduciaria, Inmobiliario, Inmueble, Bienes, vehículo, Solicitud de Información, Certificado o certificación; captúralas usando EXACTAMENTE la misma palabra de esta lista y concaténalas separadas por comas (ej. "Nomina, Pagador, Información"). Si no se encuentra ninguna, usar "0".

    demandados:
    - NÚMERO DE RADICADO (demandados[].numeroRadicado): Información que trae el documento, la cual puede encontrarse también con los títulos Resolución, Expediente, Radicado, Proceso o Número de Proceso. Dato numérico, máximo 23 caracteres, sin puntos ni comas. Ejemplo: "68001400300520240075800". Si el texto cita más de un número bajo estos títulos (ej. una resolución anterior y luego la actual), usa SIEMPRE la actual/vigente. En DESEMBARGO específicamente, si el documento cita la resolución que ordenó el embargo original y la resolución que ordena el desembargo, usa SIEMPRE la del desembargo — la del embargo original va en radicadoADesembargar, no acá. Si no se encuentra, usar "0".
    - OFICIO A DESEMBARGAR (demandados[].oficioEmbargoADesembargar): Solo en DESEMBARGO. Número del OFICIO original que ordenó el embargo y que ahora se deja sin efecto para ESTE demandado. Se extrae POR DEMANDADO: si el oficio levanta un único embargo, usa el MISMO número para todos; si el documento lista oficios DISTINTOS por demandado, asigna a cada uno el suyo. REGLA ESTRICTA DE ETIQUETA: solo se acepta el número que venga bajo una etiqueta explícita de "OFICIO" o "COMUNICADO". Si el documento solo cita una RESOLUCIÓN, ACTO ADMINISTRATIVO, EXPEDIENTE, RADICADO o PROCESO, este campo queda en "0" y ese número va en radicadoADesembargar — acá NUNCA se sustituye el número de oficio por uno de resolución. Extraer SOLAMENTE los dígitos, sin fechas ni texto ni palabras como "OFICIO" o "DEL". Ejemplo: "dejar sin efecto el oficio 1128 del 26 de febrero de 2025" → "1128". Máximo 23 caracteres numéricos. Si no aplica (no es DESEMBARGO) o no hay etiqueta de oficio, usar "0" — el post-procesamiento se encarga de completar ese "0" con la fecha del oficio cuando corresponda, vos no necesitas resolver esa parte.
    - VALOR EMBARGO (demandados[].valorEmbargo): Transcribir LITERALMENTE el valor tal como aparece escrito en el documento para ESTA APARICIÓN del demandado, incluyendo puntos, comas y el símbolo $ si lo tiene (ej. "$16.000.000.00" o "16.000.000,00"). NO limpies separadores, NO conviertas a número, NO redondees — el sistema hace esa conversión en post-procesamiento. Si no se encuentra, usar "0". CRÍTICO: cada objeto de "demandados" lleva UNA sola cuantía. Si el documento asigna varias cuantías a la misma persona, NO las sumes ni elijas una: genera un objeto por cada cuantía (ver BLOQUE 2).
    - RADICADO A DESEMBARGAR (demandados[].radicadoADesembargar): Solo en DESEMBARGO. Número de la RESOLUCIÓN o acto administrativo que ORDENÓ EL EMBARGO original que ahora se levanta para ESTE demandado. Es el campo complementario de oficioEmbargoADesembargar: aquel solo admite números bajo etiqueta de OFICIO/COMUNICADO, este toma los de RESOLUCIÓN/ACTO ADMINISTRATIVO. Si el documento cita ambos, se llenan los dos; si cita solo uno, el otro queda en "0" — nunca se copia el mismo número al campo que no corresponde por etiqueta. También se extrae POR DEMANDADO: si el oficio levanta un único embargo, usa el MISMO número para todos; si el documento lista radicados DISTINTOS por demandado, asigna a cada uno el suyo. Extraer SOLAMENTE los dígitos. Máximo 23 caracteres numéricos. Si no aplica (no es DESEMBARGO) o no se encuentra, usar "0".
    - PRODUCTOS A EMBARGAR (demandados[].cuentas[].productosAEmbargar): Información que trae el documento indicando sobre cuáles productos recae la medida de embargo. Si la medida recae sobre CUENTAS DE AHORROS, CORRIENTES Y CDT'S (más de un tipo de cuenta), indicar "TODOS". Si recae solo sobre CUENTAS DE AHORRO, indicar "AHORROS". Si recae solo sobre CUENTAS CORRIENTES, indicar "CORRIENTES". Si recae solo sobre CDT'S, indicar "CDT'S".
    - CUENTAS ESPECÍFICAS (demandados[].cuentas[].numeroCuenta): Limpiar guiones o espacios. Máximo 12 caracteres numéricos. Si no se encuentra, usar "0".

    ente:
    - CORREOS ELECTRÓNICOS (ente.correosElectronicos): Extraer TODAS las direcciones válidas que contengan @ como ARRAY. Es OBLIGATORIO extraer el correo del remitente (ej. Juzgado o entidad que emite el oficio), que suele ubicarse en el encabezado o al final del documento. Si no hay, retornar [].
      LIMPIEZA OBLIGATORIA DE CADA DIRECCIÓN: el elemento debe quedar EXACTAMENTE con el formato "usuario@dominio.tld" en MINÚSCULAS, sin ningún carácter extra alrededor ni dentro. Elimina: viñetas y guiones de lista ("•", "·", "-", "–", "—", "»"), el prefijo "mailto:", etiquetas como "Correo:", "Correo electrónico:", "E-mail:", "Notificaciones:", delimitadores ("<", ">", "(", ")", "[", "]"), comillas, espacios (incluidos los que el OCR mete en medio de la dirección) y los signos de puntuación que cierran la frase (".", ",", ";", ":"). Ejemplos: "• mailto:Juzgado01@Ramajudicial.gov.co," → "juzgado01@ramajudicial.gov.co"; "<j03pcm@cendoj.ramajudicial.gov.co>." → "j03pcm@cendoj.ramajudicial.gov.co".
      UN ELEMENTO = UNA DIRECCIÓN: si el documento trae varias pegadas por comas, punto y coma o saltos de línea, sepáralas en elementos distintos del array. No repitas la misma dirección dos veces.
      Si un fragmento no alcanza a formar una dirección completa y válida (le falta el "@", el dominio o la extensión), OMÍTELO del array — es preferible un array más corto que un elemento con basura.
    - LINK COLOCACION RESPUESTA (ente.linkColocacionRespuesta): SIEMPRE debe quedar en "0". NUNCA llenarlo con el link de verificación del documento (ej. URL de firmaelectronica.ramajudicial.gov.co) ni con ninguna otra URL, dirección física o texto. Valor fijo obligatorio: "0".

    --- BLOQUE 5: LIMPIEZA DE FORMATO TRANSVERSAL ---
    - NÚMEROS DE IDENTIFICACIÓN (demandados[].numeroId, demandantes[].numeroId): Remover formato (puntos, comas, guiones). Extraer exclusivamente dígitos, tal como aparece en el documento, sin truncar salvo que supere 30 caracteres (límite real de la columna en BD).
    - NOMBRES (demandados[].nombre, demandantes[].nombre, ente.nombreEnteEmbargante): transcribir TAL COMO aparecen en el documento, SIN truncar ni abreviar. Estos nombres se cruzan contra la base de datos del cliente, así que un nombre incompleto rompe ese cruce — prioriza la fidelidad al texto original sobre cualquier idea de "acortar".
    - PORCENTAJE (demandados[].porcentajeAEmbargar): Solo el número, sin signo %, sin puntos ni comas. Si no hay, usar "0".
    - TIPO DE APLICACIÓN (infoCliente.tipoAplicacion): el valor por defecto "CONGELAR" aplica a EMBARGO y ALCANCE por igual. En DESEMBARGO no hay default: usar "0" siempre.

    --- ESTRUCTURA DE TEXTO A PROCESAR (DESDE OCR) ---
    {{text}}
  `,
};
