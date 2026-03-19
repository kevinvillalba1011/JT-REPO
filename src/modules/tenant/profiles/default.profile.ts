import { SchemaType } from '@google/generative-ai';
import { TenantProfile } from '../interfaces/tenant-profile.interface';

export const DefaultProfile: TenantProfile = {
  id: 'default',
  identifierKey: 'no_id_demandado',
  clientFields: [
    'no_id_demandado',
    'fecha_hora_recepcion_correo',
    'fecha_hora_procesamiento_oficio',
    'tipo_de_proceso',
    'tipo_oficio',
    'nombre_oficio_inicial',
    'nombre_oficio_final',
    'valor_embargo',
    'no_de_radicado',
    'cuenta_banco_agrario_deposito_judicial',
    'nombre_banco_deposito_judicial',
    'nombre_secretario_o_funcionario_ente_embargante',
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
    'link_colocacion_respuesta',
    'productos_a_embargar',
    'si_cta_especifica_no_cta',
    'porcentaje_a_embargar',
    'productos_a_futuro',
    'oficio_embargo_a_desembargar',
    'radicado_oficio_embargo_a_desembargar',
    'tipo_documento_recibido_en_email',
    'tipo_de_requerimiento',
    'tipo_de_requerimiento_inembargable',
    'observaciones'
  ],
  nonClientFields: [
    'no_id_demandado',
    'fecha_hora_recepcion_correo',
    'fecha_hora_procesamiento_oficio',
    'tipo_de_proceso',
    'tipo_oficio',
    'nombre_oficio_inicial',
    'nombre_oficio_final'
  ],
  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      no_id_demandado: { type: SchemaType.STRING, nullable: true },
      fecha_hora_recepcion_correo: { type: SchemaType.STRING, nullable: true },
      fecha_hora_procesamiento_oficio: { type: SchemaType.STRING, nullable: true },
      tipo_de_proceso: { type: SchemaType.STRING, nullable: true },
      tipo_oficio: { type: SchemaType.STRING, nullable: true },
      nombre_oficio_inicial: { type: SchemaType.STRING, nullable: true },
      nombre_oficio_final: { type: SchemaType.STRING, nullable: true },
      valor_embargo: { type: SchemaType.STRING, nullable: true },
      no_de_radicado: { type: SchemaType.STRING, nullable: true },
      cuenta_banco_agrario_deposito_judicial: { type: SchemaType.STRING, nullable: true },
      nombre_banco_deposito_judicial: { type: SchemaType.STRING, nullable: true },
      nombre_secretario_o_funcionario_ente_embargante: { type: SchemaType.STRING, nullable: true },
      codigo_de_alcance: { type: SchemaType.STRING, nullable: true },
      codigo_de_aplicacion: { type: SchemaType.STRING, nullable: true },
      tipo_limite_de_inembargabilidad: { type: SchemaType.STRING, nullable: true },
      tipo_de_aplicacion: { type: SchemaType.STRING, nullable: true },
      tipo_respuesta: { type: SchemaType.STRING, nullable: true },
      tipo_id_demandado: { type: SchemaType.STRING, nullable: true },
      nombre_demandado: { type: SchemaType.STRING, nullable: true },
      tipo_id_demandante: { type: SchemaType.STRING, nullable: true },
      no_id_demandante: { type: SchemaType.STRING, nullable: true },
      nombre_demandante: { type: SchemaType.STRING, nullable: true },
      nombre_del_ente_embargante: { type: SchemaType.STRING, nullable: true },
      ciudad: { type: SchemaType.STRING, nullable: true },
      correos_electronicos: { type: SchemaType.STRING, nullable: true },
      link_colocacion_respuesta: { type: SchemaType.STRING, nullable: true },
      productos_a_embargar: { type: SchemaType.STRING, nullable: true },
      si_cta_especifica_no_cta: { type: SchemaType.STRING, nullable: true },
      porcentaje_a_embargar: { type: SchemaType.STRING, nullable: true },
      productos_a_futuro: { type: SchemaType.STRING, nullable: true },
      oficio_embargo_a_desembargar: { type: SchemaType.STRING, nullable: true },
      radicado_oficio_embargo_a_desembargar: { type: SchemaType.STRING, nullable: true },
      tipo_documento_recibido_en_email: { 
        type: SchemaType.ARRAY, 
        items: { type: SchemaType.STRING }
      },
      tipo_de_requerimiento: { 
        type: SchemaType.ARRAY, 
        items: { type: SchemaType.STRING }
      },
      tipo_de_requerimiento_inembargable: { type: SchemaType.STRING, nullable: true },
      observaciones: { type: SchemaType.STRING, nullable: true }
    },
  },
  promptTemplate: `
    Eres un extractor experto en oficios de embargo/desembargo en Colombia (Derecho Procesal Colombiano) y en normalización de datos con OCR.
    Tu tarea: convertir el texto OCR del documento y el contexto del email en el esquema JSON configurado.

    REGLAS DE NORMALIZACIÓN OCR:
    - Fechas: ISO 8601 "YYYY-MM-DD" sin hora.
    - Identificaciones: solo dígitos. Máximo 12 dígitos.
    - Radicado: 23 dígitos exactos. Corrige OCR ("O"->"0", etc.).
    - Valores: solo dígitos (sin separadores).
    - Nombres: corrige errores obvios.

    CATÁLOGOS:
    - tipo_proceso: "JUDICIAL" | "COACTIVO"
    - tipo_oficio: "EMBARGO" | "DESEMBARGO" | "ALCANCE_O_REQUERIMIENTO"
    - tipo_respuesta: "EMAIL" | "FISICO" | "LINK"
    - tipo_id: "C" | "N" | "E" | "T"
    - productos_a_futuro: "SI" | "NO"

    Campos multi-selección:
    - tipo_documento_recibido_en_email: ["INDIVIDUAL","LISTADO","MASIVO","DUPLICADO","INEMBARGABLE","DERECHO_DE_PETICION","LEY_1116","FIDUCIARIA","TUTELA","REQUERIMIENTO_SUPER","OTRAS_AREAS","PEGAR","DESPEGAR"]
    - tipo_de_requerimiento: ["ACTUALIZACION","INFORMATIVO","REQUERIMIENTO","REQUERIMIENTO_SEGUNDA_TERCERA_VEZ","APERTURA_DE_INCIDENTE","SOLICITUD_DE_INFORMACION"]

    Texto de entrada:
    {{text}}
  `
};
