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
        description: 'Numérico Maximo 12 Caracteres',
      },
      fecha_y_hora_recepcion_correo: {
        type: SchemaType.STRING,
        description: 'Fecha yyyy-mm-dd hh:mm',
      },
      fecha_y_hora_procesamiento_oficio: {
        type: SchemaType.STRING,
        description: 'Fecha yyyy-mm-dd hh:mm',
      },
      tipo_de_proceso: {
        type: SchemaType.STRING,
        description: 'Alfabético - Texto (JUDICIAL / COACTIVO)',
      },
      tipo_oficio: {
        type: SchemaType.STRING,
        description:
          'Alfabético - Texto (EMBARGO/DESEMBARGO/ALCANCE O REQUERIMIENTO)',
      },
      nombre_oficio_inicial: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico Maximo 40 Caracteres',
      },
      nombre_oficio_final: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico Maximo 40 Caracteres',
      },
      valor_embargo: {
        type: SchemaType.STRING,
        description: 'Numérico Maximo 13 Caracteres',
      },
      no_de_radicado: {
        type: SchemaType.STRING,
        description: 'Numérico Maximo 23 caracteres (Resolución, Expediente)',
      },
      cuenta_banco_agrario_deposito_judicial: {
        type: SchemaType.STRING,
        description: 'Numérico Maximo 12 caracteres',
      },
      nombre_banco_deposito_judicial: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico Maximo 40 Caracteres',
      },
      nombre_del_secretario_o_funcionario_ente_embargante: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico Maximo 25 Caracteres',
      },
      codigo_de_alcance: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico',
      },
      codigo_de_aplicacion: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico Maximo 2 caracteres',
      },
      tipo_limite_de_inembargabilidad: {
        type: SchemaType.STRING,
        description:
          'Alfabético - Texto (25 SMLV - 510 UVT - Carta Circular de la Superfinanciera)',
      },
      tipo_de_aplicacion: {
        type: SchemaType.STRING,
        description: 'Alfabético - Texto (Congelar, Debitar)',
      },
      tipo_respuesta: {
        type: SchemaType.STRING,
        description: 'Alfabético - Texto (email, fisico, link)',
      },
      tipo_id_demandado: {
        type: SchemaType.STRING,
        description: 'Alfabético - Texto 1 Carácter (C, N, E, T)',
      },
      nombre_demandado: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico Maximo 25 Caracteres',
      },
      tipo_id_demandante: {
        type: SchemaType.STRING,
        description: 'Alfabético - Texto 1 Carácter (C, N, E, T)',
      },
      no_id_demandante: {
        type: SchemaType.STRING,
        description: 'Numérico Maximo 12 Caracteres',
      },
      nombre_demandante: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico Maximo 25 Caracteres',
      },
      nombre_del_ente_embargante: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico Maximo 40 Caracteres',
      },
      ciudad: { type: SchemaType.STRING, description: 'Alfabético - Texto' },
      correos_electronicos: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico. Debe contener @',
      },
      link_de_colocacion_de_respuesta: {
        type: SchemaType.STRING,
        description: 'URL o Ruta Alfabética',
      },
      productos_a_embargar: {
        type: SchemaType.STRING,
        description:
          'Alfabético - Texto (Tipos de Cuentas, Números de Cuentas)',
      },
      si_es_cta_especifica_no_de_cta: {
        type: SchemaType.STRING,
        description: 'Numérico Maximo 12 Caracteres',
      },
      procentaje_a_embargar: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico Maximo %',
      },
      productos_a_futuro: {
        type: SchemaType.STRING,
        description: 'Alfabético - Texto (SI/NO)',
      },
      oficio_de_embargo_a_desembargar: {
        type: SchemaType.STRING,
        description: 'AlfaNumérico Maximo 40 Caracteres',
      },
      radicado_oficio_de_embargo_a_desembargar: {
        type: SchemaType.STRING,
        description: 'Numérico Maximo 23 caracteres',
      },
      tipo_documento_recibido_en_email: {
        type: SchemaType.STRING,
        description:
          'Alfabético - Texto (INDIVIDUAL, LISTADO, MASIVO, DUPLICADO, etc.)',
      },
      tipo_de_requerimiento: {
        type: SchemaType.STRING,
        description:
          'Alfabético - Texto (ACTUALIZACIÓN, INFORMATIVO, REQUERIMIENTO, etc.)',
      },
      tipo_de_requerimiento_inembargable: {
        type: SchemaType.STRING,
        description: 'Alfabético - Texto (Qué se requiere)',
      },
      observaciones: {
        type: SchemaType.STRING,
        description:
          'Alfabético - Texto (ALERTAS: REITERACIÓN, SEGUNDO ALCANCE, etc.)',
      },
    },
    required: ['no_de_radicado', 'tipo_oficio'],
  },

  promptTemplate: `
    Eres un asistente EXPERTO operando en el sistema de embargos de DAVIBANK.
    Extraerás información de documentos jurídicos colombianos (ej. oficios, embargos).
    Debes emitir estricta y únicamente un objeto JSON con las reglas establecidas a continuación.
    Tu prioridad es aplicar formateos, trucamientos y validaciones de extensión antes de devolver cada campo.
    IMPORTANTE: El objeto JSON resultante DEBE tener sus claves en el mismo orden que se definen en el esquema.

    --- REGLAS ESTRICTAS DE EXTRACCIÓN Y LIMPIEZA ---
    - NO ID DEMANDADO / DEMANDANTE: Remover formato. Extraer exclusivamente números. Truncar si supera 12 caracteres.
    - VALOR EMBARGO: Limpiar separadores, obtener solo el valor bruto, truncar si excede 13 dígitos.
    - NO. DE RADICADO: Extracción del radicado juzgado. Solo números. Rellenar ceros a la izquierda si es corto. Asegurar obligatoriamente <= 23 caracteres.
    - CUENTA AGRARIO / DEPÓSITO JUDICIAL / CTA ESPECÍFICA: Limpiar guiones o espacios. Extraer máximo 12 caracteres numéricos.
    - FECHAS: Devolver formato limpio estándar "YYYY-MM-DD" o "YYYY-MM-DD HH:mm".
    - TIPO ID (Demandante / Demandado): 1 solo carácter (ej. 'C' para CC, 'N' para NIT, 'E' paras Extranjería).
    - CORREOS ELECTRÓNICOS: Buscar y extraer válidamente cadenas que contentan @.
    - NOMBRES Y ALFANUMÉRICOS: Nombres de personas o secretarios tienen un límite artificial dictado de 25 caracteres. Oficios y Juzgados (Ente embargante) máximo 40 caracteres. Aplica truncamiento inteligente si exceden.
    - PORCENTAJE: Asegurar la presencia del símbolo de '%'.

    Dejar el campo en blanco ("") en caso de no poder encontrar ni inferir la información en el documento. Nunca inventes o alucines datos. Aplica las truncaciones de tamaño impuestas en tus descripciones al pie de la letra.

    --- ESTRUCTURA DE TEXTO A PROCESAR (DESDE OCR) ---
    {{text}}
  `,
};
