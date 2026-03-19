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
    'tipoDocumento', 'nombreEntidad', 'ciudad', 'departamento', 'nRadicado', 
    'nOficio', 'nCtaDptoJudicial', 'fechaOficio', 'coactivo', 'nombreFuncionario',
    'cargoFuncionario', 'fechaHoraProceso', 'nombreArchivo', 'rutaPdf', 'usuario',
    'procesado', 'demandantes', 'demandados', 'entidadesBancarias'
  ],
  nonClientFields: [
    'tipoDocumento', 'nRadicado', 'fechaOficio', 'procesado'
  ],

  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      tipoDocumento: { 
        type: SchemaType.STRING, 
        description: "Clasificación válida: EMBARGO, DESEMBARGO, TRASLADO, REITERACION, VINCULO, ACLARACION, DESCONOCIDO" 
      },
      nombreEntidad: { type: SchemaType.STRING },
      ciudad: { type: SchemaType.STRING },
      departamento: { type: SchemaType.STRING },
      nRadicado: { type: SchemaType.STRING, description: "23 dígitos numéricos sin guiones ni espacios. Completar con ceros a la izquierda." },
      nOficio: { type: SchemaType.STRING, description: "Exactamente 4 dígitos. Ignora No. o N°" },
      nCtaDptoJudicial: { type: SchemaType.STRING },
      fechaOficio: { type: SchemaType.STRING, description: "Formato yyyy-MM-dd" },
      coactivo: { type: SchemaType.BOOLEAN },
      nombreFuncionario: { type: SchemaType.STRING },
      cargoFuncionario: { type: SchemaType.STRING },
      fechaHoraProceso: { type: SchemaType.STRING, description: "yyyy-MM-dd HH:mm:ss" },
      nombreArchivo: { type: SchemaType.STRING },
      rutaPdf: { type: SchemaType.STRING },
      usuario: { type: SchemaType.STRING },
      procesado: { type: SchemaType.BOOLEAN },
      demandantes: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            nombre: { type: SchemaType.STRING, description: "Solo nombres y apellidos" },
            tipoIdentificacion: { type: SchemaType.STRING, description: "CC o NIT" },
            identificacion: { type: SchemaType.STRING, description: "Solo dígitos" }
          }
        }
      },
      demandados: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            nombre: { type: SchemaType.STRING, description: "Solo nombres y apellidos" },
            tipoIdentificacion: { type: SchemaType.STRING, description: "CC o NIT" },
            identificacion: { type: SchemaType.STRING, description: "Solo dígitos" },
            valorEmbargo: { type: SchemaType.NUMBER, description: "Valor monetario como número" },
            numeroProceso: { type: SchemaType.STRING },
            cliente: { type: SchemaType.BOOLEAN },
            clienteEspecial: { type: SchemaType.BOOLEAN }
          }
        }
      },
      entidadesBancarias: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            nombre: { type: SchemaType.STRING },
            emailNotificacion: { type: SchemaType.STRING }
          }
        }
      }
    },
    // Gemini se apega a required con fiereza.
    required: ["tipoDocumento", "nRadicado"]
  },

  promptTemplate: `
    Eres un asistente EXPERTO en extraer información clave de documentos judiciales colombianos.
    Tu única salida debe adherirse de manera exacta al esquema JSON estructurado. Todo otro comentario será penalizado.

    --- REGLAS ESTRICTAS DE EXTRACCIÓN Y LIMPIEZA ---
    1. CLASIFICACIÓN DE DOCUMENTO
       - Usa SOLO UNO DE: EMBARGO, DESEMBARGO, TRASLADO, REITERACION, VINCULO, ACLARACION, DESCONOCIDO

    2. DEMANDANTES Y DEMANDADOS:
       - nombre: Extraer de manera limpia solo nombres y apellidos.
       - tipoIdentificacion: Normalizar a CC o NIT si hay variantes.
       - identificacion: Responde ESTRICTAMENTE con solo dígitos. Eliminar puntos, guiones o separadores de miles.
       - Si no están cerca del bloque nominal, escanea y búscalo a lo largo de todo el texto.

    3. VALORES FINANCIEROS (valorEmbargo):
       - Es el valor monetario global decretado o sumado en la medida. Extraer como monto numérico absoluto sin símbolos ni comas.

    4. IDENTIFICADORES PROCESALES (Radicado y Oficio):
       - nRadicado: Exige 23 dígitos absolutos. Si el OCR extrae menos, evalúa si requiere ceros de relleno fijos de juzgados. Nunca devuelvas guiones.
       - nOficio: Exactamente 4 dígitos (Ej. "0456"). Ignorar prefijos decorativos "Auto No. ", "N° ", "Of.".
       - nCtaDptoJudicial: Cuenta del depósito judicial. Solo dígitos.

    5. DATOS TEMPORALES (Fechas):
       - fechaOficio: Formatear a 'YYYY-MM-DD'. Si no se declara expresamente "fecha de oficio", hereda la fecha de firma o generación del juez en el papel.
       - fechaHoraProceso: Si se conoce el sello o estampa digital, convertir a 'YYYY-MM-DD HH:mm:ss'. Si la ignoras, usa nulo o vacío ("").

    6. OTROS (Bancos y Metadatos):
       - entidadesBancarias: Solo nombra el banco y extrae su dirección de notificación si aparece en el cuerpo.
       - Usa falso en booleanos (ej. coactivo, procesado) u omissions/cadenas vacías ("") si la información brilla por su ausencia. Jamás inventes ni alucines datos.

    --- ESTRUCTURA DE TEXTO A PROCESAR (DESDE OCR) ---
    {{text}}
  `
};
