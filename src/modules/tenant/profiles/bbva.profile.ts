import { SchemaType } from '@google/generative-ai';
import { TenantProfile } from '../interfaces/tenant-profile.interface';

/**
 * Perfil BBVA — repurpuesto para el botón "Rellenar datos" del portal B2B
 * legado (EmbargosWebJTC / JBoss). No confundir con el flujo batch de
 * microservicios: este perfil NO estaba en uso productivo (davibank es el
 * que corre en producción), así que se ajustó libremente a los campos de
 * negocio catalogados en `campos_por_tipo_documento_3.json`
 * (EMBARGO/DESEMBARGO/ALCANCE), que es lo que necesita el formulario de
 * captura manual del portal. Ver .agents/decisions.md.
 *
 * Un solo responseSchema cubre los tres tipos de oficio: `tipoOficio` le
 * dice al consumidor cuáles de los demás campos aplican. Campos que no
 * aplican al tipo de oficio detectado, o que el modelo no encuentra en el
 * documento, se devuelven como "0" (string) — misma convención de fallback
 * que ya usa el resto del pipeline (ver normalizeNumericField/
 * normalizeNameField en ModelProcessor).
 */
export const BbvaProfile: TenantProfile = {
  id: 'bbva',
  identifierKey: 'noIdDemandado',

  clientFields: [
    'noIdDemandado',
    'fechaHoraRecepcionCorreo',
    'fechaHoraProcesamientoOficio',
    'tipoProceso',
    'tipoOficio',
    'nombreOficioInicial',
    'nombreOficioFinal',
    'valorEmbargo',
    'noRadicado',
    'cuentaBancoAgrarioDepositoJudicial',
    'nombreBancoDepositoJudicial',
    'nombreSecretarioFuncionario',
    'codigoAlcance',
    'codigoAplicacion',
    'tipoLimiteInembargabilidad',
    'tipoAplicacion',
    'tipoRespuesta',
    'tipoIdDemandado',
    'nombreDemandado',
    'tipoIdDemandante',
    'noIdDemandante',
    'nombreDemandante',
    'nombreEnteEmbargante',
    'ciudad',
    'correosElectronicos',
    'linkColocacionRespuesta',
    'productosAEmbargar',
    'ctaEspecificaNumero',
    'porcentajeAEmbargar',
    'productosAFuturo',
    'tipoDocumentoRecibidoEmail',
    'tipoDeRequerimiento',
    'tipoDeRequerimientoInembargable',
    'observaciones',
    'oficioEmbargoADesembargar',
    'radicadoOficioEmbargoADesembargar',
  ],
  nonClientFields: ['tipoOficio', 'noRadicado', 'tipoProceso'],

  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      noIdDemandado: {
        type: SchemaType.STRING,
        description:
          'Numero de identificacion del demandado/accionado/embargado/procesado. Solo digitos, sin puntos ni comas. "0" si no se encuentra.',
      },
      fechaHoraRecepcionCorreo: {
        type: SchemaType.STRING,
        description:
          'Fecha y hora de recepcion del correo. Formato DD/MM/AAAA HH:mm:ss. "0" si no aplica o no se encuentra.',
      },
      fechaHoraProcesamientoOficio: {
        type: SchemaType.STRING,
        description:
          'Fecha y hora de procesamiento del registro. Formato DD/MM/AAAA HH:mm:ss. "0" si no aplica.',
      },
      tipoProceso: {
        type: SchemaType.STRING,
        description:
          'JUDICIAL (entidades o procesos judiciales) o COACTIVO (entidades del estado/autonomas en su gestion).',
      },
      tipoOficio: {
        type: SchemaType.STRING,
        description:
          'EMBARGO (embargo, secuestro, bloqueo, retencion, medida cautelar, librar mandamiento de pago), DESEMBARGO (desembargo, levantamiento, dejar sin efecto, liberacion, cancelacion, suspender), o ALCANCE (reiteracion, requerir, mantenimiento, oficiar, incidente, sancion, desacato, notificar, ampliar).',
      },
      nombreOficioInicial: {
        type: SchemaType.STRING,
        description:
          'Nombre del documento/oficio con el que se transmitio para gestion. "0" si no aplica o no se encuentra.',
      },
      nombreOficioFinal: {
        type: SchemaType.STRING,
        description:
          '"0" siempre - este campo lo calcula el sistema de captura, no lo extraigas del documento.',
      },
      valorEmbargo: {
        type: SchemaType.STRING,
        description:
          'Valor del embargo. Solo digitos, sin puntos, comas ni decimales. Si esta en letras, conviertelo a numero entero. No aplica a DESEMBARGO. "0" si no aplica o no se encuentra.',
      },
      noRadicado: {
        type: SchemaType.STRING,
        description:
          'Numero de radicado/resolucion/expediente/proceso. Hasta 23 digitos, solo numeros. "0" si no se encuentra.',
      },
      cuentaBancoAgrarioDepositoJudicial: {
        type: SchemaType.STRING,
        description:
          'Cuenta de deposito judicial / Banco Agrario. Solo digitos. No aplica a DESEMBARGO. "0" si no aplica o no se encuentra.',
      },
      nombreBancoDepositoJudicial: {
        type: SchemaType.STRING,
        description:
          'Nombre del banco donde se deben hacer los depositos judiciales. No aplica a DESEMBARGO. "0" si no aplica.',
      },
      nombreSecretarioFuncionario: {
        type: SchemaType.STRING,
        description:
          'Secretario/funcionario/persona que firma el documento o medida cautelar. "0" si no se encuentra.',
      },
      codigoAlcance: {
        type: SchemaType.STRING,
        description:
          'Solo para EMBARGO. Codigo si algun dato capturado falta o es inconsistente (1-INCO ID DDO, 2-INCO ID DDTE, 3-INCO TIT VS DEC, 4-INCO ID ILEGIBLE, 5-INCO VALOR, 6-INCO RADICADO, 7-INCO NO DIRIGIDO AL BANCO, 8-INCO NO INDICA COMO PROCEDER, 9-INCO CTA BANCO AGRARIO, 10-INCO BENEFICIO DE INEMBARGABILIDAD, 11-REQUERIMIENTO (RQ), 12-REITERACION, 13-CAMBIO DE CUENTA DEPOSITO JUDICIAL (WEB), 14-CAMBIO DE CUANTIA, 15-INFORMATIVO, 16-DERECHO PETICION/TUTELA (OTRAS AREAS), 17-OFICIO EN BLANCO (INCOMPLETO), 18-SIN INFO PARA CORRESPONDENCIA, 19-ACLARACION). "0" si no aplica.',
      },
      codigoAplicacion: {
        type: SchemaType.STRING,
        description:
          'Solo para EMBARGO. Codigo de aplicacion segun el banco. "0" si no aplica o no se encuentra.',
      },
      tipoLimiteInembargabilidad: {
        type: SchemaType.STRING,
        description:
          'Solo para EMBARGO. Norma/justificacion legal del limite de inembargabilidad (ej. Art. 837-1 ET, Decreto 379 de 2007, Ley 100 art. 134, etc). "0" si no aplica.',
      },
      tipoAplicacion: {
        type: SchemaType.STRING,
        description:
          'CONGELAR (mantener/congelar/bloquear recursos) o DEBITAR (consignar/debitar/dejar a disposicion). No aplica a DESEMBARGO. "0" si no aplica.',
      },
      tipoRespuesta: {
        type: SchemaType.STRING,
        description:
          'EMAIL, FISICO o LINK. Si no se indica pero hay correo electronico, usa EMAIL. No aplica a DESEMBARGO. "0" si no aplica.',
      },
      tipoIdDemandado: {
        type: SchemaType.STRING,
        description:
          'C o CC (cedula ciudadania), E (cedula extranjeria), N o NIT, T o TI (tarjeta identidad), P o PA (pasaporte). "0" si no se encuentra.',
      },
      nombreDemandado: {
        type: SchemaType.STRING,
        description:
          'Nombre del demandado/accionado/embargado/procesado. "0" si no se encuentra.',
      },
      tipoIdDemandante: {
        type: SchemaType.STRING,
        description:
          'Solo para EMBARGO. Un solo caracter: C, E, N, T o P. "0" si no aplica.',
      },
      noIdDemandante: {
        type: SchemaType.STRING,
        description:
          'Solo para EMBARGO. Numero de identificacion del demandante/accionante. Solo digitos. "0" si no aplica.',
      },
      nombreDemandante: {
        type: SchemaType.STRING,
        description:
          'Nombre del demandante/accionante. No aplica a DESEMBARGO. "0" si no aplica o no se encuentra.',
      },
      nombreEnteEmbargante: {
        type: SchemaType.STRING,
        description:
          'Nombre de la entidad que emite la orden (ej. DIAN, juzgado, gobernacion). No aplica a DESEMBARGO. "0" si no aplica.',
      },
      ciudad: {
        type: SchemaType.STRING,
        description:
          'Ciudad donde se emite el documento. No aplica a DESEMBARGO. "0" si no aplica o no se encuentra.',
      },
      correosElectronicos: {
        type: SchemaType.STRING,
        description:
          'Correo(s) para respuesta, cuando tipoRespuesta es EMAIL. No aplica a DESEMBARGO. "0" si no aplica.',
      },
      linkColocacionRespuesta: {
        type: SchemaType.STRING,
        description:
          'Link o direccion fisica para cargar la respuesta. No aplica a DESEMBARGO. "0" si no aplica.',
      },
      productosAEmbargar: {
        type: SchemaType.STRING,
        description:
          'Solo para EMBARGO: TODOS, AHORROS, CORRIENTES o CDTS. "0" si no aplica.',
      },
      ctaEspecificaNumero: {
        type: SchemaType.STRING,
        description:
          'Solo para EMBARGO. Numero de cuenta especifica sobre la que aplica la medida. Solo digitos. "0" si no aplica.',
      },
      porcentajeAEmbargar: {
        type: SchemaType.STRING,
        description:
          'Solo para EMBARGO. Porcentaje a embargar, solo el numero (ej "50"). "0" si no aplica.',
      },
      productosAFuturo: {
        type: SchemaType.STRING,
        description:
          'Solo para EMBARGO. "SI" o "NO" - si se deben embargar productos futuros del cliente. "0" si no aplica.',
      },
      tipoDocumentoRecibidoEmail: {
        type: SchemaType.STRING,
        description:
          'LISTADO, MASIVO, DUPLICADO, INEMBARGABLE, DERECHO DE PETICION, LEY 1116, FIDUCIARIA, TUTELA, REQUERIMIENTO SUPER, u OTRAS AREAS. "0" si no se encuentra.',
      },
      tipoDeRequerimiento: {
        type: SchemaType.STRING,
        description:
          'ACTUALIZACION, INFORMATIVO, REQUERIMIENTO, REQUERIMIENTO POR SEGUNDA O TERCERA VEZ, APERTURA DE INCIDENTE, SOLICITUD DE INFORMACION, PEGAR o DESPEGAR. No aplica a DESEMBARGO. "0" si no aplica.',
      },
      tipoDeRequerimientoInembargable: {
        type: SchemaType.STRING,
        description:
          'Solo para EMBARGO, cuando el cliente es inembargable (ej REITERACION, INCIDENTE). "0" si no aplica.',
      },
      observaciones: {
        type: SchemaType.STRING,
        description:
          'Alertas: REITERACION, SEGUNDO ALCANCE, APERTURA INCIDENTE, REQUERIMIENTO, PAGADOR, ALIMENTOS, DIVORCIO, NOMINA. No aplica a DESEMBARGO. "0" si no aplica.',
      },
      oficioEmbargoADesembargar: {
        type: SchemaType.STRING,
        description:
          'Solo para DESEMBARGO. Numero de oficio de embargo que este documento desembarga. "0" si no aplica.',
      },
      radicadoOficioEmbargoADesembargar: {
        type: SchemaType.STRING,
        description:
          'Solo para DESEMBARGO. Radicado del oficio de embargo a desembargar. Solo digitos. "0" si no aplica.',
      },
    },
    // Gemini se apega a required con fiereza.
    required: ['tipoOficio', 'noRadicado'],
  },

  promptTemplate: `
    Eres un asistente EXPERTO en extraccion de datos judiciales colombianos
    para el sector bancario. Tu objetivo es procesar el documento adjunto
    (oficio judicial) y devolver un JSON estricto con la informacion que un
    operador necesitaria digitar manualmente en el sistema de captura.

    --- CLASIFICACION (tipoOficio) ---
    1. EMBARGO: "embargo", "secuestro", "bloqueo", "retencion", "medida cautelar", "librar mandamiento de pago".
    2. DESEMBARGO: "desembargo", "levantamiento", "dejar sin efecto", "liberacion", "cancelacion", "suspender".
    3. ALCANCE: "reiteracion", "requerir", "mantenimiento", "oficiar", "incidente", "sancion", "desacato", "notificar", "ampliar".

    --- REGLA DE FALLBACK (MUY IMPORTANTE) ---
    Si un campo no aplica al tipo de oficio detectado, o no se encuentra en
    el documento, devuelve el string "0" para ese campo. NUNCA inventes un
    valor. NUNCA dejes un campo fuera del JSON de respuesta.

    --- LIMPIEZA DE DATOS ---
    - Identificaciones (noIdDemandado, noIdDemandante, ctaEspecificaNumero,
      cuentaBancoAgrarioDepositoJudicial): solo digitos, sin puntos, comas
      ni espacios.
    - valorEmbargo: solo digitos, sin simbolos ($) ni separadores. Si el
      valor esta en letras, conviertelo a numero entero.
    - noRadicado: hasta 23 digitos, solo numeros.
    - Fechas: formato DD/MM/AAAA HH:mm:ss.
    - Nombres (nombreDemandado, nombreDemandante, nombreEnteEmbargante,
      nombreBancoDepositoJudicial): todo en MAYUSCULAS.

    --- SALIDA ESPERADA ---
    Devuelve UNICAMENTE el JSON, sin explicaciones ni texto adicional. El
    incumplimiento sera penalizado.

    --- CONTENIDO A PROCESAR ---
    {{text}}
  `,
};
