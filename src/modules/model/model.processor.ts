import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { DocumentState } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ClientService } from '../client/client.service';

@Injectable()
@Processor('cola_modelo', { concurrency: 5 })
export class ModelProcessor extends WorkerHost {
  private readonly logger = new Logger(ModelProcessor.name);
  private readonly donePath: string;
  private readonly genAI: GoogleGenerativeAI;

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly configService: ConfigService,
    private readonly clientService: ClientService,
  ) {
    super();
    this.donePath = this.configService.get<string>('DONE_PATH', './local/done');

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not found. Model processor might fail.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey || 'dummy-key');
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { documentId, filePath, text } = job.data;
    this.logger.log(
      `Processing Model Job ${job.id} for Document ${documentId}`,
    );

    // Update State: PROCESANDO_MODELO
    await this.documentRepository.updateState(
      documentId,
      DocumentState.PROCESANDO_MODELO,
    );

    // Check if key is valid (simple check)
    if (!this.configService.get<string>('GEMINI_API_KEY')) {
      throw new Error('Missing GEMINI_API_KEY environment variable.');
    }

    try {
      let resultJson;

      // Define Prompt
      const prompt = `
      Eres un extractor experto en oficios de embargo/desembargo en Colombia (Derecho Procesal Colombiano) y en normalización de datos con OCR.
      Tu tarea: convertir el texto OCR del documento y el contexto del email en UN SOLO objeto JSON con el esquema EXACTO definido abajo.

      REGLAS DE SALIDA (OBLIGATORIAS)
      - Responde ÚNICAMENTE con JSON válido (sin markdown, sin comentarios, sin explicación).
      - Usa EXACTAMENTE las llaves del esquema (mismos nombres).
      - Si un dato NO aparece o no es inferible con alta certeza, usa null (no inventes).
      - No agregues llaves adicionales.
      - Para campos de selección múltiple, devuelve arrays de strings normalizados.
      - Normaliza: trim, espacios simples, sin saltos innecesarios.

        CLASIFICACIÓN (campo tipo_oficio)
        - "EMBARGO": ordena decretar/registrar/efectuar embargo, retener, inmovilizar, congelar, debitar.
        - "DESEMBARGO": levanta/cancela/ordena cancelar medida, levantar embargo, liberar recursos.
        - "ALCANCE_O_REQUERIMIENTO": aclara, amplía, requiere información, reitera, solicita soporte, alcance.
        Si hay mezcla, prioriza la orden principal; lo demás va a observaciones y tipos de requerimiento.

        NORMALIZACIÓN OCR
        - Fechas: ISO 8601 "YYYY-MM-DD". Si viene con hora, NO la incluyas: conserva solo fecha.
        - Identificaciones (cédula/NIT/etc.): solo dígitos, elimina puntos/espacios. Máximo 12 dígitos (si excede, conserva tal cual pero sin separadores y anota en observaciones).
        - Radicado: DEBE quedar en 23 dígitos exactos. Corrige OCR típico: "O"->"0", "I"->"1", espacios, guiones. Si aun así no se logra 23 dígitos, deja null.
        - Valores: deja solo dígitos (sin separadores). Si el texto dice "SMLV/UVT" eso va al campo tipo_limite_inembargabilidad, no a valor_embargo.
        - Nombres: corrige errores obvios ("J0an"->"Juan"), conserva mayúsculas/minúsculas razonables.

        LÓGICA DE NEGOCIO
        - Diferencia Demandante vs Demandado:
          - Demandante: quien solicita/promueve el proceso (acreedor/ejecutante).
          - Demandado: titular embargado/ejecutado/deudor.
        - Cuenta de Depósitos Judiciales / Banco Agrario: suele ser cuenta/depósito judicial asociada a juzgado/municipio.
        - Si el oficio va a múltiples entidades o bancos: consolida en "productos_a_embargar" y "correos_electronicos" (separados por coma) y detalla en observaciones.

        CATÁLOGOS / ENUMS (usa exactamente estos valores si aplica)
        - tipo_proceso: "JUDICIAL" | "COACTIVO" | null
        - tipo_oficio: "EMBARGO" | "DESEMBARGO" | "ALCANCE_O_REQUERIMIENTO" | null
        - tipo_respuesta: "EMAIL" | "FISICO" | "LINK" | null
        - tipo_id_demandado / tipo_id_demandante: "C" | "N" | "E" | "T" | null
        - productos_a_futuro: "SI" | "NO" | null

        Campos multi-selección (arrays):
        - tipo_documento_recibido_en_email: valores permitidos:
          ["INDIVIDUAL","LISTADO","MASIVO","DUPLICADO","INEMBARGABLE","DERECHO_DE_PETICION","LEY_1116","FIDUCIARIA","TUTELA","REQUERIMIENTO_SUPER","OTRAS_AREAS","PEGAR","DESPEGAR"]
        - tipo_de_requerimiento: valores permitidos:
          ["ACTUALIZACION","INFORMATIVO","REQUERIMIENTO","REQUERIMIENTO_SEGUNDA_TERCERA_VEZ","APERTURA_DE_INCIDENTE","SOLICITUD_DE_INFORMACION"]
        Si el documento trae algo equivalente con otra redacción, mapea al valor más cercano; si no, deja [].

        ESQUEMA JSON (36 CAMPOS)
        Devuelve EXACTAMENTE este objeto y tipos:

      {
        "no_id_demandado": string|null,
        "fecha_hora_recepcion_correo": string|null,
        "fecha_hora_procesamiento_oficio": string|null,
        "tipo_de_proceso": string|null,
        "tipo_oficio": string|null,
        "nombre_oficio_inicial": string|null,
        "nombre_oficio_final": string|null,
        "valor_embargo": string|null,
        "no_de_radicado": string|null,
        "cuenta_banco_agrario_deposito_judicial": string|null,
        "nombre_banco_deposito_judicial": string|null,
        "nombre_secretario_o_funcionario_ente_embargante": string|null,
        "codigo_de_alcance": string|null,
        "codigo_de_aplicacion": string|null,
        "tipo_limite_de_inembargabilidad": string|null,
        "tipo_de_aplicacion": string|null,
        "tipo_respuesta": string|null,
        "tipo_id_demandado": string|null,
        "nombre_demandado": string|null,
        "tipo_id_demandante": string|null,
        "no_id_demandante": string|null,
        "nombre_demandante": string|null,
        "nombre_del_ente_embargante": string|null,
        "ciudad": string|null,
        "correos_electronicos": string|null,
        "link_colocacion_respuesta": string|null,
        "productos_a_embargar": string|null,
        "si_cta_especifica_no_cta": string|null,
        "porcentaje_a_embargar": string|null,
        "productos_a_futuro": string|null,
        "oficio_embargo_a_desembargar": string|null,
        "radicado_oficio_embargo_a_desembargar": string|null,
        "tipo_documento_recibido_en_email": string[],
        "tipo_de_requerimiento": string[],
        "tipo_de_requerimiento_inembargable": string|null,
        "observaciones": string|null
      }

      VALIDACIONES FINALES ANTES DE RESPONDER
      - no_de_radicado y radicado_oficio_embargo_a_desembargar: si no son 23 dígitos, pon null.
      - tipo_documento_recibido_en_email y tipo_de_requerimiento: siempre arrays (aunque sean []).
      - productos_a_futuro: solo "SI" o "NO" o null.
      Texto de entrada ${text}
      `;

      // Call Gemini
      this.logger.log('Calling Gemini API...');
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
      });

      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const generatedText = response.text().trim();

        this.logger.debug(`Gemini Raw Result: ${generatedText}`);

        // Limpieza de Markdown y parseo de JSON
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/); // Match de la primera llave a la última

        if (jsonMatch) {
          try {
            resultJson = JSON.parse(jsonMatch[0]);

            // New logic: Check if Demandado is Client
            const demandadoId =
              resultJson.demandado?.identificacion ||
              resultJson.identificacion_demandado;
            if (demandadoId) {
              const isClient = this.clientService.isClient(demandadoId);
              if (!isClient) {
                this.logger.warn(
                  `Demandado ${demandadoId} is NOT a client. Trimming JSON to 7 fields.`,
                );
                // Keep only top 7 fields
                const keys = Object.keys(resultJson).slice(0, 7);
                const trimmedJson = {};
                keys.forEach((k) => (trimmedJson[k] = resultJson[k]));
                resultJson = trimmedJson;
              }
            }
          } catch (e) {
            resultJson = { summary: generatedText, error: 'JSON Parse Error' };
          }
        } else {
          resultJson = { summary: generatedText };
        }
      } catch (err) {
        this.logger.error(`Gemini API Error: ${err.message}`);
        throw err;
      }

      // Success
      this.logger.log(
        `Model Success. Result keys: ${Object.keys(resultJson).join(', ')}`,
      );

      const fileName = path.basename(filePath);
      const doneFilePath = path.join(this.donePath, fileName);

      // Move file
      try {
        fs.renameSync(filePath, doneFilePath);
      } catch (err) {
        fs.copyFileSync(filePath, doneFilePath);
        fs.unlinkSync(filePath);
      }

      // Update DB
      await this.documentRepository.updateState(
        documentId,
        DocumentState.IA_OK,
        {
          json_modelo: resultJson,
        },
      );
    } catch (error) {
      this.logger.error(
        `Model Processing Failed for Document ${documentId}: ${error.message}`,
        error.stack,
      );

      // Update state to MODEL_ERROR before re-throwing for BullMQ retries
      await this.documentRepository.updateState(
        documentId,
        DocumentState.MODEL_ERROR,
        {
          json_modelo: {
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        },
      );

      // Re-throw to allow BullMQ to handle retries
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} has completed!`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: any) {
    const { documentId } = job.data;
    this.logger.error(
      `Job ${job.id} (Document ${documentId}) has failed permanently with ${err.message}`,
    );

    // Update document state to MODEL_ERROR when all retries are exhausted
    try {
      await this.documentRepository.updateState(
        documentId,
        DocumentState.MODEL_ERROR,
        {
          json_modelo: {
            error: err.message,
            errorType: 'permanent_failure',
            timestamp: new Date().toISOString(),
            attempts: job.attemptsMade,
          },
        },
      );
      this.logger.log(
        `Document ${documentId} marked as MODEL_ERROR in database`,
      );
    } catch (dbError) {
      this.logger.error(`Failed to update document state: ${dbError.message}`);
    }
  }
}
