import { SchemaType } from '@google/generative-ai';
import { TenantProfile } from '../interfaces/tenant-profile.interface';

export const DavibankProfile: TenantProfile = {
  id: 'davibank',
  identifierKey: 'no_id_demandado', // Clave principal para chequeos asíncronos en ClientStrategy
  clientFields: [
    'no_id_demandado',
    'fecha_y_hora_recepcion_correo',
    'fecha_y_hora_procesamiento_oficio',
    'tipo_de_proceso',
    'tipo_oficio',
    'nombre_oficio_inicial',
    'nombre_oficio_final',
    'valor_embargo',
    'no_de_radicado',
    'cuenta_banco_agrario_deposito_judicial',
    'nombre_banco_deposito_judicial',
    'nombre_del_secretario_o_funcionario_ente_embargante',
    'codigo_de_alcance',
    'codigo_de_aplicacion',
    'tipo_limite_de_inembargabilidad',
    'tipo_de_aplicacion',
    'tipo_respuesta',
    'tipo_id_demandado',
    'nombre_demandado',
    'tipo_id_demandante',
    'no_id_demandante',
    'nombre_demandante',
    'nombre_del_ente_embargante',
    'ciudad',
    'correos_electronicos',
    'link_de_colocacion_de_respuesta',
    'productos_a_embargar',
    'si_es_cta_especifica_no_de_cta',
    'procentaje_a_embargar',
    'productos_a_futuro',
    'oficio_de_embargo_a_desembargar',
    'radicado_oficio_de_embargo_a_desembargar',
    'tipo_documento_recibido_en_email',
    'tipo_de_requerimiento',
    'tipo_de_requerimiento_inembargable',
    'observaciones',
  ],
  nonClientFields: [
    'no_id_demandado',
    'fecha_y_hora_recepcion_correo',
    'fecha_y_hora_procesamiento_oficio',
    'tipo_de_proceso',
    'tipo_oficio',
    'nombre_oficio_inicial',
    'nombre_oficio_final',
    'observaciones',
  ],

  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      no_id_demandado: {
        type: SchemaType.STRING,
        description:
          'Información que trae el documento correspondiente al numero de identificacion del demandado, accionado, embargado, sujeto del embargo. Este dato es un numero entero sin puntos ni comas ni decimales. Maximo 12 Caracteres.',
      },
      fecha_y_hora_recepcion_correo: {
        type: SchemaType.STRING,
        description:
          'Informacion que trae el documento o correo sobre la cual se indica la fecha y hora en la que recibimos el documento. Formato: yyyy-mm-dd hh:mm',
      },
      fecha_y_hora_procesamiento_oficio: {
        type: SchemaType.STRING,
        description:
          'Corresponde a la fecha y hora en la cual la herramienta procesa el documento. Formato: yyyy-mm-dd hh:mm',
      },
      tipo_de_proceso: {
        type: SchemaType.STRING,
        description:
          'Informacion que trae el documento identificando si el proceso es: JUDICIAL o COACTIVO.',
      },
      tipo_oficio: {
        type: SchemaType.STRING,
        description:
          'Alfabético - Texto (EMBARGO/DESEMBARGO/ALCANCE O REQUERIMIENTO)',
      },
      nombre_oficio_inicial: {
        type: SchemaType.STRING,
        description:
          'Información que trae el documento correspondiente al titulo o nombre principal de identificación del documento u oficio inicial (Ej: RESOLUCION NO. 1128). Maximo 40 Caracteres.',
      },
      nombre_oficio_final: {
        type: SchemaType.STRING,
        description:
          'Información que trae el documento correspondiente al titulo o nombre principal de identificación del documento u oficio final (Ej: RESOLUCION NO. 3511). Maximo 40 Caracteres.',
      },
      valor_embargo: {
        type: SchemaType.STRING,
        description:
          'Información que trae el documento correspondiente al valor o monto solicitado por la entidad. Este dato es un numero entero sin puntos ni comas ni decimales. Maximo 13 Caracteres.',
      },
      no_de_radicado: {
        type: SchemaType.STRING,
        description:
          'Es el número principal de identificación del documento actual (Resolución, Expediente o Radicado). IMPORTANTE: Si el documento menciona una "Resolución Anterior" o "Oficio de Embargo previo", NO uses ese número; busca el número que identifica al acto administrativo actual. En textos como "RESOLUCION NO. 1128 ... 3511 DEL 14 DE OCTUBRE", el radicado suele ser el número más reciente o el que no está asociado a la referencia de origen. Máximo 23 caracteres numéricos.',
      },
      cuenta_banco_agrario_deposito_judicial: {
        type: SchemaType.STRING,
        description:
          'Información que trae el documento correspondiente al numero de la cuenta del banco agrario para depositos judiciales. Numero entero sin puntos ni comas. Maximo 12 caracteres.',
      },
      nombre_banco_deposito_judicial: {
        type: SchemaType.STRING,
        description:
          'Nombre del banco para depósitos judiciales. CRÍTICO: En documentos de DESEMBARGO, este campo debe ir VACÍO ("") a menos que se ordene un traslado a un banco nuevo. Máximo 40 Caracteres.',
      },
      nombre_del_secretario_o_funcionario_ente_embargante: {
        type: SchemaType.STRING,
        description:
          'Información que trae el documento correspondiente al secretario, encargado o persona que firma el documento o medida cautelar',
      },
      codigo_de_alcance: {
        type: SchemaType.STRING,
        description:
          'Programar la herramienta con información que provee el banco acorde a listado de Codigos.',
      },
      codigo_de_aplicacion: {
        type: SchemaType.STRING,
        description:
          'Programar la herramienta con información que provee el banco acorde a listado de Codigos. Maximo 2 caracteres.',
      },
      tipo_limite_de_inembargabilidad: {
        type: SchemaType.STRING,
        description:
          'Informacion que trae el documento extrayendo el texto correspondiente (Art. 837-1 ET, Decreto 379, Carta Circular SFC, etc.)',
      },
      tipo_de_aplicacion: {
        type: SchemaType.STRING,
        description:
          'Interpretación del documento: CONGELAR (Mantener, Bloquear) o DEBITAR (Consignar, Dejar a disposicion).',
      },
      tipo_respuesta: {
        type: SchemaType.STRING,
        format: 'enum',
        enum: ['Email', 'Fisico', 'Link'],
        description:
          'Tipo de respuesta esperado. REGLA DE ORO: Si no se especifica explícitamente "Fisico" o "Link", selecciona SIEMPRE "Email" por defecto.',
      },
      tipo_id_demandado: {
        type: SchemaType.STRING,
        description:
          'Tipo de identificacion del demandado (C: Cedula, N: NIT, E: Extranjeria, T: TI, P: Pasaporte). 1 Carácter.',
      },
      nombre_demandado: {
        type: SchemaType.STRING,
        description:
          'Información correspondiente al nombre del demandado, accionado, embargado. Maximo 50 Caracteres.',
      },
      tipo_id_demandante: {
        type: SchemaType.STRING,
        description:
          'Tipo de identificacion del demandante (C, N, E, T, P). 1 Carácter.',
      },
      no_id_demandante: {
        type: SchemaType.STRING,
        description:
          'Numero de identificacion del demandante. Numero entero sin puntos ni comas. Maximo 12 Caracteres.',
      },
      nombre_demandante: {
        type: SchemaType.STRING,
        description:
          'Nombre del demandante o accionante. Maximo 25 Caracteres.',
      },
      nombre_del_ente_embargante: {
        type: SchemaType.STRING,
        description:
          'Nombre de la entidad que emite la orden (DIAN, JUZGADO, GOBERNACION). Maximo 40 Caracteres.',
      },
      ciudad: {
        type: SchemaType.STRING,
        description: 'Ciudad en la cual se emite el documento u oficio.',
      },
      correos_electronicos: {
        type: SchemaType.STRING,
        description:
          'Correo electronico para respuesta acorde a la columna TIPO DE RESPUESTA.',
      },
      link_de_colocacion_de_respuesta: {
        type: SchemaType.STRING,
        description:
          'Link o direccion Fisica en la cual debemos cargar o remitir la respuesta.',
      },
      productos_a_embargar: {
        type: SchemaType.STRING,
        description:
          'Sobre cuales productos recae la medida (AHORROS, CORRIENTES, CDT, TODOS).',
      },
      si_es_cta_especifica_no_de_cta: {
        type: SchemaType.STRING,
        description:
          'Numero del producto especifico sobre el cual se aplica la medida. Numero sin puntos ni comas. Maximo 12 Caracteres.',
      },
      procentaje_a_embargar: {
        type: SchemaType.STRING,
        description:
          'Porcentaje solicitado (ej: 50). Solo el numero, sin signo ni puntos ni comas.',
      },
      productos_a_futuro: {
        type: SchemaType.STRING,
        description:
          'Indicar SI/NO si el oficio menciona embargar productos futuros.',
      },
      oficio_de_embargo_a_desembargar: {
        type: SchemaType.STRING,
        description:
          'En oficios de DESEMBARGO, numero de oficio a dejar sin efecto. Maximo 40 Caracteres.',
      },
      radicado_oficio_de_embargo_a_desembargar: {
        type: SchemaType.STRING,
        description:
          'En oficios de DESEMBARGO, numero de (Resolucion, Expediente, etc.) del embargo original. Maximo 23 caracteres.',
      },
      tipo_documento_recibido_en_email: {
        type: SchemaType.STRING,
        description:
          'Clasificacion: LISTADO, MASIVO, DUPLICADO, INEMBARGABLE, TUTELA, etc.',
      },
      tipo_de_requerimiento: {
        type: SchemaType.STRING,
        description:
          'ACTUALIZACIÓN, INFORMATIVO, REQUERIMIENTO, APERTURA DE INCIDENTE, SOLICITUD DE INFORMACIÓN, etc.',
      },
      tipo_de_requerimiento_inembargable: {
        type: SchemaType.STRING,
        description:
          'Intencion si el sujeto es inembargable: REITERACION, INCIDENTE, etc.',
      },
      observaciones: {
        type: SchemaType.STRING,
        description:
          'Alertas encontradas: REITERACIÓN, SEGUNDO ALCANCE, PAGADOR, ALIMENTOS, DIVORCIO, NOMINA.',
      },
    },
    required: ['no_de_radicado', 'tipo_oficio', 'tipo_respuesta'],
  },

  promptTemplate: `
    Eres un asistente EXPERTO operando en el sistema de embargos de DAVIBANK.
    Extraerás información de documentos jurídicos colombianos (ej. oficios, embargos).
    Debes emitir estricta y únicamente un objeto JSON con las reglas establecidas a continuación.
    Tu prioridad es aplicar formateos, trucamientos y validaciones de extensión antes de devolver cada campo.
    IMPORTANTE: El objeto JSON resultante DEBE tener sus claves en el mismo orden que se definen en el esquema.

    --- REGLAS DE ORO DE CLASIFICACIÓN ---
    Para determinar el 'tipo_oficio', utiliza estas señales semánticas del dataset oficial:
    1. EMBARGO: Busca "decretar el embargo", "limitarse a la suma", "remante", o "perfeccionamiento".
    2. DESEMBARGO: Prioridad alta. Busca "cancelar el embargo", "levántese la medida", "terminación de proceso" o "dejar sin efectos".
    3. ALCANCE O REQUERIMIENTO: Busca "reiterar oficio", "informar cumplimiento", "orden impartida", "traslado de títulos" o "poner a disposición".

    --- REGLAS ESTRICTAS DE EXTRACCIÓN Y LIMPIEZA ---
    - NO ID DEMANDADO / DEMANDANTE: Remover formato. Extraer exclusivamente números. Truncar si supera 12 caracteres.
    - VALOR EMBARGO: Limpiar separadores, obtener solo el valor bruto, truncar si excede 13 dígitos.
    - NO. DE RADICADO: Extracción del radicado juzgado. Solo números. Rellenar ceros a la izquierda si es corto. Asegurar obligatoriamente <= 23 caracteres. CRÍTICO: Si el texto cita una resolución anterior (ej: "RES 1128") y luego define la resolución actual (ej: "RES 3511"), el radicado es SIEMPRE la resolución actual (3511). No confundir con el radicado del embargo original.
    - CUENTA AGRARIO / DEPÓSITO JUDICIAL / CTA ESPECÍFICA: Limpiar guiones o espacios. Extraer máximo 12 caracteres numéricos.
    - FECHAS: Devolver formato limpio estándar "YYYY-MM-DD" o "YYYY-MM-DD HH:mm".
    - TIPO ID (Demandante / Demandado): 1 solo carácter (ej. 'C' para CC, 'N' para NIT, 'E' paras Extranjería).
    - CORREOS ELECTRÓNICOS: Buscar y extraer válidamente cadenas que contentan @.
    - NOMBRES Y ALFANUMÉRICOS: Nombres de personas o secretarios tienen un límite artificial dictado de 25 caracteres. Oficios y Juzgados (Ente embargante) máximo 40 caracteres. Aplica truncamiento inteligente si exceden.
    - PORCENTAJE: Asegurar la presencia del símbolo de '%'.

    - TIPO RESPUESTA: Priorizar "Email" si existe una dirección de correo en el texto o si no se especifica método físico/link.
    - DESEMBARGOS: Sé extra cuidadoso. No extraigas valores de embargo ni bancos de depósito si el documento es un levantamiento de medida (Desembargo).

    --- ESTRUCTURA DE TEXTO A PROCESAR (DESDE OCR) ---
    {{text}}
  `,
};
