import { SchemaType } from '@google/generative-ai';
import { TenantProfile } from '../interfaces/tenant-profile.interface';

export const BbvaProfile: TenantProfile = {
  id: 'bbva',
  // Para ubicar cuál campo usar para verificar si es cliente del banco
  // Asumiremos que validamos cada identificacion de la lista de demandados en la capa posterior (ModelProcessor),
  // pero el TenantProfile actual exige un 'identifierKey' global. Dado que ahora es un array 'demandados',
  // temporalmente pondremos 'demandados' para que la lógica de limpieza intente buscar por ahí.
  // Nota: Deberás adaptar ModelProcessor si quieres en el futuro cruzar la DB Cliente contra Arreglos Anidados.
  identifierKey: 'demandados',

  // Como la estructura es de múltiples entidades (matrices), la reportería plana
  // puede que necesite un export customizado o simplemente exportamos el JSON completo.
  clientFields: [
    'tipoDocumento',
    'nombreEntidad',
    'ciudad',
    'departamento',
    'nRadicado',
    'nOficio',
    'nCtaDptoJudicial',
    'fechaOficio',
    'coactivo',
    'nombreFuncionario',
    'cargoFuncionario',
    'fechaHoraProceso',
    'nombreArchivo',
    'rutaPdf',
    'usuario',
    'procesado',
    'demandantes',
    'demandados',
    'entidadesBancarias',
  ],
  nonClientFields: ['tipoDocumento', 'nRadicado', 'fechaOficio', 'procesado'],

  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      tipoDocumento: {
        type: SchemaType.STRING,
        description:
          'Clasificación válida: EMBARGO, DESEMBARGO, TRASLADO, REITERACION, VINCULO, ACLARACION, DESCONOCIDO',
      },
      nombreEntidad: { type: SchemaType.STRING },
      ciudad: { type: SchemaType.STRING },
      departamento: { type: SchemaType.STRING },
      nRadicado: {
        type: SchemaType.STRING,
        description:
          '23 dígitos numéricos sin guiones ni espacios. Completar con ceros a la izquierda.',
      },
      nOficio: {
        type: SchemaType.STRING,
        description: 'Exactamente 4 dígitos. Ignora No. o N°',
      },
      nCtaDptoJudicial: { type: SchemaType.STRING },
      fechaOficio: {
        type: SchemaType.STRING,
        description: 'Formato yyyy-MM-dd',
      },
      coactivo: { type: SchemaType.BOOLEAN },
      nombreFuncionario: { type: SchemaType.STRING },
      cargoFuncionario: { type: SchemaType.STRING },
      fechaHoraProceso: {
        type: SchemaType.STRING,
        description: 'yyyy-MM-dd HH:mm:ss',
      },
      nombreArchivo: { type: SchemaType.STRING },
      rutaPdf: { type: SchemaType.STRING },
      usuario: { type: SchemaType.STRING },
      procesado: { type: SchemaType.BOOLEAN },
      demandantes: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            nombre: {
              type: SchemaType.STRING,
              description: 'Solo nombres y apellidos',
            },
            tipoIdentificacion: {
              type: SchemaType.STRING,
              description: 'CC o NIT',
            },
            identificacion: {
              type: SchemaType.STRING,
              description: 'Solo dígitos',
            },
          },
        },
      },
      demandados: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            nombre: {
              type: SchemaType.STRING,
              description: 'Solo nombres y apellidos',
            },
            tipoIdentificacion: {
              type: SchemaType.STRING,
              description: 'CC o NIT',
            },
            identificacion: {
              type: SchemaType.STRING,
              description: 'Solo dígitos',
            },
            valorEmbargo: {
              type: SchemaType.NUMBER,
              description: 'Valor monetario como número',
            },
            numeroProceso: { type: SchemaType.STRING },
            cliente: { type: SchemaType.BOOLEAN },
            clienteEspecial: { type: SchemaType.BOOLEAN },
          },
        },
      },
      entidadesBancarias: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            nombre: { type: SchemaType.STRING },
            emailNotificacion: { type: SchemaType.STRING },
          },
        },
      },
    },
    // Gemini se apega a required con fiereza.
    required: ['tipoDocumento', 'nRadicado'],
  },

  promptTemplate: `
    Eres un asistente EXPERTO en extracción de datos judiciales colombianos. Tu objetivo es procesar el texto de un OCR y devolver un JSON estricto.

    --- REGLAS DE ORO DE CLASIFICACIÓN ---
    Para determinar el 'tipoDocumento', utiliza estas señales semánticas del dataset oficial:

    1. EMBARGO: Busca "decretar el embargo", "limitarse a la suma", "remante", o "perfeccionamiento".
    2. DESEMBARGO: Prioridad alta. Busca "cancelar el embargo", "levántese la medida", "terminación de proceso" o "dejar sin efectos".
    3. TRASLADO: Busca "traslado de títulos", "poner a disposición" o "depósitos judiciales".
    4. REITERACION: Busca "reiterar oficio", "informar cumplimiento" o "orden impartida".
    5. Si no hay coincidencia clara con las frases anteriores, usa: VINCULO, ACLARACION o DESCONOCIDO.

    --- REGLAS ESTRICTAS DE EXTRACCIÓN Y LIMPIEZA ---
    1. IDENTIFICACIÓN (Demandantes/Demandados):
      - tipoIdentificacion: Solo 'CC' o 'NIT'.
      - identificacion: Solo DÍGITOS. Elimina puntos, comas y espacios (Ej: "1.020.333-4" -> "10203334").
      
    2. VALORES (valorEmbargo):
      - Extrae el monto global. Formato: Solo números, sin símbolos ($) ni separadores (Ej: "15.000.000" -> "15000000").

    3. IDENTIFICADORES PROCESALES:
      - nRadicado: Debe tener 23 dígitos exactos. Si el OCR falla, completa con ceros a la izquierda según el estándar judicial.
      - nOficio: Solo los últimos 4 dígitos numéricos.
      - nCtaDptoJudicial: Cuenta judicial de 12 dígitos. Solo números.

    4. FECHAS:
      - fechaOficio: 'YYYY-MM-DD'. Si no está clara, usa la fecha de la firma digital o pie de página.
      - fechaHoraProceso: 'YYYY-MM-DD HH:mm:ss' o null si no existe sello de tiempo.

    --- SALIDA ESPERADA ---
    Devuelve ÚNICAMENTE el JSON. No incluyas explicaciones ni texto adicional. El incumplimiento será penalizado.

    --- TEXTO A PROCESAR (OCR) ---
    {{text}}
  `,
};
