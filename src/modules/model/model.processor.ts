import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { DocumentRepository } from '../documents/repositories/document.repository';
import { DocumentState, IntegrationStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { GeminiService } from '../../common/services/gemini.service';
import { ClientService } from '../client/client.service';
import type { TenantProfile } from '../tenant/interfaces/tenant-profile.interface';
import { IntegrationService } from '../integration/integration.service';
import { DailySequenceService } from '@/common/services/daily-sequence.service';
import { NombreOficioFinalService } from '@/common/services/nombre-oficio-final.service';
import { EntryReportService } from '../entry-report/entry-report.service';
import { nowBogotaISOString, nowBogotaDate } from '@/common/utils/date.util';
import { isPermanentError } from '@/common/utils/error-classifier.util';
import { DocumentAiStrategy } from '../ocr/strategies/document-ai.strategy';
import { parseValorEmbargo } from '@/common/utils/valor-embargo.util';
import {
  esDesembargo,
  normalizarTipoAplicacion,
  demandanteCoactivoPorDefecto,
  SIN_DATO,
} from '@/common/utils/tipo-oficio.util';
import { normalizarCorreos } from '@/common/utils/correo.util';
import {
  carpetaFechaBogota,
  resolverRutaSinColision,
  moverArchivoAFechaDestino,
} from '@/common/utils/file-destination.util';

/** Variantes largas de tipoId aceptadas en el documento, mapeadas a la letra corta del enum. */
const TIPO_ID_LARGO_A_CORTO: Record<string, string> = {
  CC: 'C',
  NIT: 'N',
  CE: 'E',
  TI: 'T',
  PA: 'P',
};

@Injectable()
@Processor('cola_modelo', {
  concurrency: parseInt(process.env.MODEL_QUEUE_CONCURRENCY || '2', 10),
  limiter: {
    max: parseInt(process.env.MODEL_QUEUE_RPM_LIMIT || '15', 10),
    duration: 60000,
  },
  lockDuration: 300000, // 5 minutes to bypass WSL/Docker clock drift
})
export class ModelProcessor extends WorkerHost {
  private readonly logger = new Logger(ModelProcessor.name);
  private readonly ocrDestinationPath: string;
  private readonly unreadablePath: string;

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly configService: ConfigService,
    private readonly clientService: ClientService,
    private readonly geminiService: GeminiService,
    private readonly integrationService: IntegrationService,
    private readonly dailySequence: DailySequenceService,
    private readonly nombreOficioFinalService: NombreOficioFinalService,
    private readonly docAiStrategy: DocumentAiStrategy,
    private readonly entryReportService: EntryReportService,
    @Inject('TENANT_PROFILE') private readonly profile: TenantProfile,
  ) {
    super();
    this.ocrDestinationPath = path.resolve(
      process.cwd(),
      this.configService.get<string>(
        'OCR_DESTINATION_PATH',
        './local/ocr-done',
      ),
    );
    this.unreadablePath = path.resolve(
      process.cwd(),
      this.configService.get<string>(
        'OCR_UNREADABLE_PATH',
        './local/ocr-unreadable',
      ),
    );
  }

  /**
   * Deriva el mimeType soportado por Gemini a partir de la extensión.
   * Devuelve null para extensiones no aptas para envío multimodal.
   */
  private resolveMimeType(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.pdf':
        return 'application/pdf';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.tiff':
      case '.tif':
        return 'image/tiff';
      default:
        return null;
    }
  }

  /**
   * Estrategia de extracción: envía el archivo DIRECTO a Gemini (multimodal).
   * Si el multimodal falla, o el archivo supera el límite inline configurado,
   * cae a Document AI (OCR) → Gemini sobre texto como FALLBACK. Si ninguno
   * extrae contenido, lanza error (documento ilegible → revisión).
   */
  private async extraerMultimodalConFallback(
    filePath: string,
  ): Promise<Record<string, unknown>> {
    const mimeType = this.resolveMimeType(filePath);
    const maxInlineMb = this.configService.get<number>(
      'GEMINI_INLINE_MAX_MB',
      15,
    );

    let demasiadoGrande = false;
    try {
      const stat = await fs.promises.stat(filePath);
      demasiadoGrande = stat.size > maxInlineMb * 1024 * 1024;
    } catch {
      // Si no se puede medir el tamaño, se intenta multimodal de todos modos.
    }

    if (mimeType && !demasiadoGrande) {
      try {
        const buffer = await fs.promises.readFile(filePath);
        this.logger.log(
          `Extracción MULTIMODAL (PDF directo a Gemini): ${path.basename(filePath)}`,
        );
        return (await this.geminiService.extraerJudicial(
          '(El contenido a procesar está en el documento adjunto.)',
          buffer,
          mimeType,
        )) as Record<string, unknown>;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Multimodal falló (${msg}). Fallback a Document AI (OCR).`,
        );
      }
    } else if (demasiadoGrande) {
      this.logger.warn(
        `Archivo supera ${maxInlineMb}MB para envío inline. Usando Document AI (OCR).`,
      );
    }

    // Fallback: Document AI (OCR) -> Gemini sobre texto
    const text = await this.docAiStrategy.extractText(filePath);
    if (!text.trim()) {
      throw new Error(
        'Documento ilegible: ni el envío multimodal ni Document AI (OCR) extrajeron contenido.',
      );
    }
    return (await this.geminiService.extraerJudicial(text)) as Record<
      string,
      unknown
    >;
  }

  /**
   * Normaliza un campo string a solo dígitos y lo recorta a `maxLength`.
   * Si el resultado queda vacío, usa el fallback "0" (la convención de
   * fallback del prompt). No toca el valor si ya es "0". Loguea si hubo
   * que limpiar o recortar, para trazabilidad.
   */
  private normalizeNumericField(
    fieldLabel: string,
    value: unknown,
    maxLength: number,
  ): unknown {
    if (typeof value !== 'string' || value === '0') {
      return value;
    }
    const soloDigitos = value.replace(/\D+/g, '');
    const normalizado = soloDigitos.slice(0, maxLength) || '0';
    if (normalizado !== value) {
      const cambios: string[] = [];
      if (soloDigitos !== value) {
        cambios.push('se quitaron caracteres no numéricos');
      }
      if (soloDigitos.length > maxLength) {
        cambios.push(`se recortó a ${maxLength} caracteres`);
      }
      if (!soloDigitos) {
        cambios.push('quedó vacío tras limpiar, se usó fallback "0"');
      }
      this.logger.debug(
        `${fieldLabel} normalizado (${cambios.join('; ')}): "${value}" -> "${normalizado}"`,
      );
    }
    return normalizado;
  }

  /**
   * Normaliza un campo de nombre a mayúsculas y, si se indica `maxLength`, lo
   * recorta a ese tope. No toca el valor si ya es "0" (fallback). Loguea si
   * hubo que mayuscular o recortar, para trazabilidad.
   *
   * `maxLength` es opcional: nombres que se cruzan contra la BD del cliente
   * (demandante, ente embargante) NO deben truncarse — un nombre incompleto
   * rompe ese cruce — así que esos llamados se hacen sin `maxLength`.
   */
  private normalizeNameField(
    fieldLabel: string,
    value: unknown,
    maxLength?: number,
  ): unknown {
    if (typeof value !== 'string' || value === '0') {
      return value;
    }
    const mayusculas = value.toUpperCase();
    const normalizado =
      maxLength !== undefined ? mayusculas.slice(0, maxLength) : mayusculas;
    if (normalizado !== value) {
      const cambios: string[] = [];
      if (mayusculas !== value) {
        cambios.push('se convirtió a mayúsculas');
      }
      if (maxLength !== undefined && mayusculas.length > maxLength) {
        cambios.push(`se recortó a ${maxLength} caracteres`);
      }
      this.logger.debug(
        `${fieldLabel} normalizado (${cambios.join('; ')}): "${value}" -> "${normalizado}"`,
      );
    }
    return normalizado;
  }

  /**
   * Normaliza tipoId a 1 sola letra (C/N/E/T/P). El schema de Gemini ya
   * restringe el enum a esos 5 valores, pero esto es cinturón y tirantes
   * por si el documento o el modelo devuelve la forma larga (CC, NIT, TI,
   * PA, CE) — se mapea a la corta ANTES de quedar fuera del enum esperado.
   */
  private normalizeTipoId(fieldLabel: string, value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }
    const upper = value.trim().toUpperCase();
    const normalizado = TIPO_ID_LARGO_A_CORTO[upper] ?? upper;
    if (normalizado !== value) {
      this.logger.debug(
        `${fieldLabel} normalizado: "${value}" -> "${normalizado}"`,
      );
    }
    return normalizado;
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { documentId, filePath, text, originalPath } = job.data;
    this.logger.verbose(
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
      let resultJson: Record<string, unknown>;

      try {
        if (
          text &&
          (text.includes('[WORD_FILE_DIRECT_PROCESSING]') ||
            text.includes('[CONVERTED_PDF_PROCESSING]'))
        ) {
          throw new Error(
            'Este es un trabajo antiguo de Word que ya no es compatible. El archivo se ha movido a la carpeta de no admitidos.',
          );
        }
        resultJson = await this.extraerMultimodalConFallback(filePath);

        // Lógica temporalmente deshabilitada por petición del usuario para guardar el JSON puro
        /*
        const demandadoId = resultJson[this.profile.identifierKey];
        if (demandadoId) {
          const isClient = this.clientService.isClient(demandadoId);
          if (!isClient) {
            this.logger.warn(
              `Ninguno de los implicados (${JSON.stringify(demandadoId)}) es un cliente. Recortando JSON por seguridad (Trimming) a ${this.profile.nonClientFields.length} campos.`,
            );
            const trimmedJson = {};
            this.profile.nonClientFields.forEach((k) => {
              if (resultJson[k] !== undefined) trimmedJson[k] = resultJson[k];
            });
            resultJson = trimmedJson;
          }
        }
        */
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Gemini API Error: ${errMsg}`);
        throw err;
      }

      // Success
      this.logger.log(
        `Model Success. Result keys: ${Object.keys(resultJson).join(', ')}`,
      );

      // Inyectar fechas manualmente en formato ISO 8601, hora de Bogotá (UTC-5)
      const nowIso = nowBogotaISOString();

      if (!resultJson.oficio || typeof resultJson.oficio !== 'object') {
        resultJson.oficio = {};
      }
      const oficio = resultJson.oficio as Record<string, unknown>;
      oficio.fechaHoraProcesamientoOficio = nowIso;

      // Cinturón y tirantes: el schema de Gemini ya restringe tipoOficio a un
      // enum estricto (EMBARGO/DESEMBARGO/ALCANCE), pero por si igual llega
      // con un calificador/sufijo (ej. "ALCANCE INDIVIDUAL"), se colapsa al
      // valor limpio. DESEMBARGO se evalúa antes que EMBARGO porque lo
      // contiene como substring ("DES-EMBARGO").
      if (typeof oficio.tipoOficio === 'string') {
        const tipoOficioUpper = oficio.tipoOficio.trim().toUpperCase();
        if (tipoOficioUpper.includes('DESEMBARGO')) {
          oficio.tipoOficio = 'DESEMBARGO';
        } else if (tipoOficioUpper.includes('EMBARGO')) {
          oficio.tipoOficio = 'EMBARGO';
        } else if (tipoOficioUpper.includes('ALCANCE')) {
          oficio.tipoOficio = 'ALCANCE';
        }
      }

      // Cinturón y tirantes: normaliza campos numéricos/de nombre con tope
      // de longitud que pide el negocio (ver auditoría de cumplimiento).
      // El prompt ya lo pide en cada caso, pero el modelo no siempre lo
      // respeta. Solo aplica al flujo individual — el flujo masivo (Excel)
      // se llena manual, no se toca. PENDIENTES a propósito (no se tocan
      // todavía): nombreBancoDepositoJudicial, demandados[].nombre.
      // nombreOficioInicial, ente.nombreEnteEmbargante,
      // ente.nombreSecretarioFuncionario, demandados[].numeroId,
      // demandantes[].numeroId y demandantes[].nombre se cruzan contra la BD
      // del cliente: NUNCA se truncan (o solo hasta el tope real de la
      // columna en BD para numeroId, ver más abajo), solo se uppercasea donde
      // ya se hacía.
      oficio.cuentaDepositoJudicial = this.normalizeNumericField(
        'cuentaDepositoJudicial',
        oficio.cuentaDepositoJudicial,
        12,
      );

      if (!resultJson.ente || typeof resultJson.ente !== 'object') {
        resultJson.ente = {};
      }
      const ente = resultJson.ente as Record<string, unknown>;
      ente.nombreEnteEmbargante = this.normalizeNameField(
        'nombreEnteEmbargante',
        ente.nombreEnteEmbargante,
      );
      ente.nombreSecretarioFuncionario = this.normalizeNameField(
        'nombreSecretarioFuncionario',
        ente.nombreSecretarioFuncionario,
      );

      // Los correos llegan con basura pegada del OCR (viñetas, "mailto:",
      // "<...>", puntuación final, saltos de línea). Se extrae de cada elemento
      // solo lo que tenga forma de correo y se descarta el resto.
      const correosOriginales = ente.correosElectronicos;
      ente.correosElectronicos = normalizarCorreos(correosOriginales);
      if (
        JSON.stringify(correosOriginales) !==
        JSON.stringify(ente.correosElectronicos)
      ) {
        this.logger.debug(
          `correosElectronicos normalizados: ${JSON.stringify(correosOriginales)} -> ${JSON.stringify(ente.correosElectronicos)}`,
        );
      }

      if (
        !resultJson.infoCliente ||
        typeof resultJson.infoCliente !== 'object'
      ) {
        resultJson.infoCliente = {};
      }
      const infoClienteTemprano = resultJson.infoCliente as Record<
        string,
        unknown
      >;
      // Forzado determinístico (mismo enfoque que linkColocacionRespuesta):
      // codigoAplicacion y codigoAlcance todavía no tienen una fuente
      // confiable de donde derivarlos (dependen de un listado del banco que
      // el modelo no recibe), así que por ahora siempre quedan en "0" en el
      // flujo individual, sin importar lo que devuelva Gemini.
      infoClienteTemprano.codigoAplicacion = '0';
      infoClienteTemprano.codigoAlcance = '0';

      // El default "CONGELAR" aplica a EMBARGO y ALCANCE: se respeta un
      // CONGELAR/DEBITAR que el modelo haya encontrado explícito en el
      // documento, y cualquier otro caso queda en "CONGELAR" (EMBARGO/ALCANCE)
      // o "0" (DESEMBARGO).
      infoClienteTemprano.tipoAplicacion = normalizarTipoAplicacion(
        oficio.tipoOficio,
        infoClienteTemprano.tipoAplicacion,
      );

      // Los dos campos de desembargo aplican EXCLUSIVAMENTE a DESEMBARGO. Se
      // fuerzan a "0" en EMBARGO/ALCANCE por si el modelo capturó un oficio o
      // resolución previa que el documento solo mencionaba de paso.
      const oficioEsDesembargo = esDesembargo(oficio.tipoOficio);

      // Fecha del oficio (DDMMAA) y fecha de procesamiento, calculadas temprano
      // porque sirven de fallback en DOS lugares: acá abajo para
      // demandados[].oficioEmbargoADesembargar, y más adelante para construir
      // oficio.nombreOficioFinal. Se leen del campo crudo que devolvió Gemini
      // en oficio.nombreOficioFinal ("{numeroOficio} DEL {fecha} ..."), ANTES
      // de que ese campo se sobreescriba con el valor final construido.
      const rawOficioFinal =
        typeof oficio.nombreOficioFinal === 'string'
          ? oficio.nombreOficioFinal
          : '';
      const rawTokens = rawOficioFinal.trim().split(/\s+/);
      const modeloFechaOficio =
        rawTokens.length >= 3 && rawTokens[1] === 'DEL' ? rawTokens[2] : '';

      // fechaOficio válida: EXACTAMENTE 6 dígitos (DDMMAA) y NO todo ceros.
      const fechaOficioDigitos = modeloFechaOficio.replace(/\D+/g, '');
      const fechaOficioValida =
        /^\d{6}$/.test(fechaOficioDigitos) && !/^0+$/.test(fechaOficioDigitos);

      // Fecha ACTUAL en DDMMAA (día-mes-año, hora Bogotá vía nowBogotaDate).
      // OJO: orden DÍA-MES, distinto del MMDD (mes-día) del consecutivo — no
      // confundir los dos formatos.
      const hoyBogota = nowBogotaDate();
      const fechaActualDDMMAA =
        String(hoyBogota.getUTCDate()).padStart(2, '0') +
        String(hoyBogota.getUTCMonth() + 1).padStart(2, '0') +
        String(hoyBogota.getUTCFullYear() % 100).padStart(2, '0');

      // Segmento fecha: la del oficio si es válida; si no, la actual.
      const segmentoFecha = fechaOficioValida
        ? fechaOficioDigitos
        : fechaActualDDMMAA;

      if (Array.isArray(resultJson.demandados)) {
        for (const demandado of resultJson.demandados as Record<
          string,
          unknown
        >[]) {
          if (!demandado || typeof demandado !== 'object') continue;
          demandado.tipoId = this.normalizeTipoId(
            'demandados[].tipoId',
            demandado.tipoId,
          );
          // Tope 30 (antes 12): es la llave de cruce contra la BD del cliente
          // (ver identifierKey del perfil), y el número de identificación
          // real puede superar 12 dígitos. 30 es el tope real de la columna
          // en BD, no un valor arbitrario.
          demandado.numeroId = this.normalizeNumericField(
            'demandados[].numeroId',
            demandado.numeroId,
            30,
          );
          demandado.numeroRadicado = this.normalizeNumericField(
            'demandados[].numeroRadicado',
            demandado.numeroRadicado,
            23,
          );
          if (!oficioEsDesembargo) {
            demandado.oficioEmbargoADesembargar = SIN_DATO;
          } else {
            const oficioADesembargarNormalizado = this.normalizeNumericField(
              'demandados[].oficioEmbargoADesembargar',
              demandado.oficioEmbargoADesembargar,
              23,
            );
            // Sin número de oficio bajo etiqueta explícita (OFICIO/COMUNICADO):
            // en vez de dejar "0", se completa con la fecha del oficio (o la de
            // procesamiento si el documento tampoco trae fecha) — mismo
            // segmentoFecha que usa nombreOficioFinal más abajo.
            if (oficioADesembargarNormalizado === SIN_DATO) {
              this.logger.debug(
                `demandados[].oficioEmbargoADesembargar sin número explícito, se usa fecha como fallback: "0" -> "${segmentoFecha}"`,
              );
            }
            demandado.oficioEmbargoADesembargar =
              oficioADesembargarNormalizado === SIN_DATO
                ? segmentoFecha
                : oficioADesembargarNormalizado;
          }
          demandado.radicadoADesembargar = oficioEsDesembargo
            ? this.normalizeNumericField(
                'demandados[].radicadoADesembargar',
                demandado.radicadoADesembargar,
                23,
              )
            : SIN_DATO;
          // El modelo transcribe valorEmbargo LITERAL (string, con puntos/comas/$
          // tal como aparece en el documento) — acá se convierte a entero COP.
          demandado.valorEmbargo = parseValorEmbargo(demandado.valorEmbargo);
          if (Array.isArray(demandado.cuentas)) {
            for (const cuenta of demandado.cuentas as Record<
              string,
              unknown
            >[]) {
              if (!cuenta || typeof cuenta !== 'object') continue;
              cuenta.numeroCuenta = this.normalizeNumericField(
                'demandados[].cuentas[].numeroCuenta',
                cuenta.numeroCuenta,
                12,
              );
            }
          }
        }
      }

      if (Array.isArray(resultJson.demandantes)) {
        for (const demandante of resultJson.demandantes as Record<
          string,
          unknown
        >[]) {
          if (!demandante || typeof demandante !== 'object') continue;
          demandante.tipoId = this.normalizeTipoId(
            'demandantes[].tipoId',
            demandante.tipoId,
          );
          // Tope 30 (antes 12): mismo motivo que demandados[].numeroId — tope
          // real de la columna en BD, no un valor arbitrario.
          demandante.numeroId = this.normalizeNumericField(
            'demandantes[].numeroId',
            demandante.numeroId,
            30,
          );
          demandante.nombre = this.normalizeNameField(
            'demandantes[].nombre',
            demandante.nombre,
          );
        }
      }

      // Regla de negocio: en procesos COACTIVOS el ente que emite la medida
      // cautelar ES el demandante. Si el modelo sí extrajo algún demandante
      // válido, se respeta tal cual; ver demandanteCoactivoPorDefecto().
      const resultadoDemandantePorDefecto = demandanteCoactivoPorDefecto(
        ente.tipoProceso,
        ente.nombreEnteEmbargante,
        resultJson.demandantes,
      );
      if (resultadoDemandantePorDefecto.accion === 'inyectar') {
        this.logger.debug(
          `demandantes[] vacío en proceso COACTIVO: se inyecta demandante derivado de ente.nombreEnteEmbargante ("${resultadoDemandantePorDefecto.demandantes[0].nombre}")`,
        );
        resultJson.demandantes = resultadoDemandantePorDefecto.demandantes;
      } else if (resultadoDemandantePorDefecto.accion === 'sin-ente') {
        this.logger.warn(resultadoDemandantePorDefecto.motivo);
      }

      // Inyectar nombreOficioInicial desde el nombre del archivo original
      // (trazabilidad). Cinturón y tirantes: solo mayúsculas — SIN tope de
      // longitud, se cruza contra la BD del cliente y truncarlo desalinea
      // ese cruce (la columna en BD es varchar(500), amplio margen).
      const nombreOficioInicialRaw = path.basename(
        filePath,
        path.extname(filePath),
      );
      const nombreOficioInicial = nombreOficioInicialRaw.toUpperCase();
      if (nombreOficioInicial !== nombreOficioInicialRaw) {
        this.logger.debug(
          `nombreOficioInicial normalizado (mayúsculas): "${nombreOficioInicialRaw}" -> "${nombreOficioInicial}"`,
        );
      }
      oficio.nombreOficioInicial = nombreOficioInicial;

      // Construcción DETERMINÍSTICA de nombreOficioFinal.
      // Estructura SIEMPRE: "{numeroOficio} DEL {fecha} {MMDD}{consecutivo4}".
      // El código ARMA el nombre desde los datos en vez de depender de que
      // Gemini entregue el esqueleto correcto (antes solo rellenaba un
      // placeholder, y colapsaba a "0" pelado o a "000 DEL 000000 ..." si el
      // modelo devolvía ceros). Del output del modelo solo se rescata el
      // numeroOficio (1er token de oficio.nombreOficioFinal) — la fechaOficio
      // (3er token) y sus derivados (fechaOficioValida, segmentoFecha,
      // fechaActualDDMMAA) ya se calcularon más arriba, antes del loop de
      // demandados, porque también los usa el fallback de
      // demandados[].oficioEmbargoADesembargar. Todo lo demás se reconstruye.
      const modeloNumeroOficio = rawTokens[0] ?? '';

      // numeroOficio válido: normalizar a SOLO dígitos y que NO sea todo ceros.
      const numeroOficioDigitos = modeloNumeroOficio.replace(/\D+/g, '');
      const numeroOficioValido =
        numeroOficioDigitos.length > 0 && !/^0+$/.test(numeroOficioDigitos);

      // Segmento numeroOficio (1ro): el número si es válido; si no, la fecha
      // del oficio si es válida; si no hay ninguno, la fecha actual.
      let segmentoNumeroOficio: string;
      if (numeroOficioValido) {
        segmentoNumeroOficio = numeroOficioDigitos;
      } else if (fechaOficioValida) {
        segmentoNumeroOficio = fechaOficioDigitos;
      } else {
        segmentoNumeroOficio = fechaActualDDMMAA;
      }

      // Segmento consecutivo (8 chars finales): SIEMPRE {MMDD}{consecutivo4}
      // (mes-día + contador diario atómico), sin importar qué devolvió el
      // modelo — antes NO se generaba cuando el modelo mandaba "0" pelado.
      const { mmdd, consecutivo } = await this.dailySequence.getNext();
      const segmentoConsecutivo = `${mmdd}${consecutivo}`;

      let nombreOficioFinal = `${segmentoNumeroOficio} DEL ${segmentoFecha} ${segmentoConsecutivo}`;
      oficio.nombreOficioFinal = nombreOficioFinal;

      // Cinturón y tirantes: recorta nombreOficioFinal a 40 caracteres.
      // Se aplica DESPUÉS de armar el nombre, para no cortar el consecutivo.
      // Solo recorte, sin mayúsculas (el negocio no lo pide para este campo).
      if (nombreOficioFinal.length > 40) {
        const recortado = nombreOficioFinal.slice(0, 40);
        this.logger.debug(
          `nombreOficioFinal normalizado (se recortó a 40 caracteres): "${nombreOficioFinal}" -> "${recortado}"`,
        );
        nombreOficioFinal = recortado;
        oficio.nombreOficioFinal = nombreOficioFinal;
      }

      // Deduplicación PERSISTENTE contra la tabla nombres_oficio_final_usados
      // (NombreOficioFinalService) — a diferencia de `resolverRutaSinColision`
      // más abajo (que solo detecta colisiones en el filesystem, dentro de la
      // subcarpeta de la fecha del día actual), esta reserva es atómica contra
      // TODA la historia en DB, sin importar cuándo se generó el nombre
      // anterior (ayer, la semana pasada, etc.). En este flujo individual las
      // colisiones son raras (el nombre ya incluye fecha + un consecutivo
      // diario atómico vía DailySequenceService), pero se aplica igual por
      // consistencia con el flujo masivo. Si el nombre ya existía, el sufijo
      // "-N" que retorna pasa a ser parte OFICIAL de nombreOficioFinal: se
      // persiste en Document y se envía al sistema externo (a diferencia del
      // sufijo de `resolverRutaSinColision`, que es solo cosmético del archivo
      // físico y nunca toca el campo lógico).
      nombreOficioFinal =
        await this.nombreOficioFinalService.resolverUnico(nombreOficioFinal);
      oficio.nombreOficioFinal = nombreOficioFinal;

      // Renombrar el archivo con nombreOficioFinal al moverlo a OCR_DESTINATION_PATH;
      // nombreOficioInicial conserva el nombre original para trazabilidad.
      // Destino: subcarpeta con la fecha del día (yyyyMMdd, hora Bogotá) dentro
      // de OCR_DESTINATION_PATH. Dos documentos distintos podrían, pese a la
      // deduplicación de arriba, seguir colisionando en esta carpeta puntual
      // (ej. dos nombres únicos en DB que se sanitizan al mismo string de
      // archivo) — sin anticolisión acá también, `fs.promises.rename`
      // sobrescribiría el primero y ambos registros en DB terminarían con
      // `oficio.rutaPdf` apuntando al mismo archivo físico.
      // `resolverRutaSinColision` agrega un sufijo "-1", "-2"... SOLO al
      // nombre del archivo físico en ese caso — es cosmético y NO se refleja
      // en `nombreOficioFinal` (distinto del sufijo de NombreOficioFinalService
      // de arriba, que sí queda en el campo lógico).
      const fileExt = path.extname(filePath);
      const sanitizedFinalName = nombreOficioFinal
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();
      const doneBaseName =
        sanitizedFinalName && sanitizedFinalName !== '0'
          ? sanitizedFinalName
          : path.basename(filePath, fileExt);
      const doneDestDir = path.join(
        this.ocrDestinationPath,
        carpetaFechaBogota(),
      );
      await fs.promises.mkdir(doneDestDir, { recursive: true });
      const doneFilePath = await resolverRutaSinColision(
        doneDestDir,
        doneBaseName,
        fileExt,
      );

      // Move file
      try {
        await fs.promises.rename(filePath, doneFilePath);
      } catch {
        await fs.promises.copyFile(filePath, doneFilePath);
        await fs.promises.unlink(filePath);
      }

      // Remove the original source file so it doesn't remain duplicated
      // alongside the copy now living in OCR_DESTINATION_PATH
      if (originalPath && originalPath !== filePath) {
        try {
          await fs.promises.unlink(originalPath);
        } catch (err: any) {
          this.logger.warn(
            `Could not remove original source file ${originalPath}: ${err.message}`,
          );
        }
      }

      oficio.rutaPdf = doneFilePath;

      if (
        !resultJson.infoCliente ||
        typeof resultJson.infoCliente !== 'object'
      ) {
        resultJson.infoCliente = {};
      }
      (
        resultJson.infoCliente as Record<string, unknown>
      ).fechaHoraRecepcionCorreo = nowIso;

      // Update DB. Esto se guarda ANTES de intentar el envío externo: el
      // JSON extraído nunca debe perderse ni quedar pendiente de escribir
      // solo porque el envío al servicio externo tarde, falle o cuelgue.
      await this.documentRepository.updateState(
        documentId,
        DocumentState.IA_OK,
        {
          jsonModel: resultJson as any,
          nombreOficioFinal,
          tipoOficioIa:
            typeof oficio.tipoOficio === 'string' ? oficio.tipoOficio : null,
        },
      );

      // Estado terminal DEFINITIVO: la extracción ya se guardó en BD arriba,
      // sin importar qué pase con el envío al servicio externo más abajo.
      // Publica acá (no en el updateState de integrationStatus más abajo,
      // que solo registra el resultado del envío externo y no debe volver
      // a contar el mismo documento).
      await this.entryReportService.publicarEstadoTerminal(
        documentId,
        DocumentState.IA_OK,
      );

      // fechaEntrada/corte del lote de origen (documents.fecha_entrada /
      // documents.corte) van EN LA RAÍZ del payload que recibe
      // ms-process-document-em, no dentro de "oficio" — se leen del Document
      // ya persistido arriba (updateState no devuelve el registro completo
      // con estos campos garantizados, así que se consulta explícitamente).
      const documentoParaIntegracion =
        await this.documentRepository.findById(documentId);
      resultJson.fechaEntrada = documentoParaIntegracion?.fechaEntrada ?? null;
      resultJson.corte = documentoParaIntegracion?.corte ?? null;

      // Integrate with external REST service. sendData() nunca lanza (atrapa
      // sus propios errores) y devuelve un boolean — antes se descartaba,
      // dejando sin rastro en BD si el JSON realmente llegó al sistema
      // externo. Se persiste el resultado en integrationStatus, un campo
      // dedicado separado del estado IA_OK (que sigue significando solo
      // "extracción exitosa").
      const integrationSent = await this.integrationService.sendData(
        resultJson,
        'IA_OK',
      );
      // NO se publica acá: este updateState solo registra el resultado del
      // envío externo (integrationStatus), no es un nuevo estado terminal —
      // el conteo de IA_OK ya se publicó arriba, justo tras guardar el JSON.
      await this.documentRepository.updateState(
        documentId,
        DocumentState.IA_OK,
        {
          integrationStatus: integrationSent
            ? IntegrationStatus.ENVIADO
            : IntegrationStatus.FALLIDO,
          integrationSentAt: nowBogotaDate(),
          integrationError: integrationSent
            ? null
            : 'Fallo al enviar al servicio externo (ver logs de IntegrationService para detalle).',
        },
      );
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Model Processing Failed for Document ${documentId}: ${errMsg}`,
        error instanceof Error ? error.stack : '',
      );

      // Errores permanentes (argumento inválido, credenciales, etc.) nunca
      // van a cambiar con un reintento: cortamos de inmediato en vez de
      // gastar los intentos restantes y llamadas extra a Gemini.
      if (isPermanentError(error)) {
        const movedTo = await this.moveToReviewFolder(filePath);
        await this.documentRepository.updateState(
          documentId,
          DocumentState.MODEL_ERROR,
          {
            jsonModel: {
              error: errMsg,
              errorType: 'permanent_no_retry',
              timestamp: nowBogotaISOString(),
              ...(movedTo ? { archivoMovido: movedTo } : {}),
            },
            rutaArchivo: movedTo,
          },
        );
        // Estado terminal DEFINITIVO: error permanente, no habrá reintento
        // (se corta con `return` sin volver a lanzar).
        await this.entryReportService.publicarEstadoTerminal(
          documentId,
          DocumentState.MODEL_ERROR,
        );
        this.logger.warn(
          `Document ${documentId}: error permanente detectado, no se reintentará.`,
        );
        return;
      }

      // Update state to MODEL_ERROR before re-throwing for BullMQ retries.
      // NO se publica acá: este MODEL_ERROR es transitorio, previo a un
      // reintento de BullMQ (ver `throw error` inmediatamente después). Si
      // se publicara acá, un mismo documento podría contarse hasta 3 veces.
      await this.documentRepository.updateState(
        documentId,
        DocumentState.MODEL_ERROR,
        {
          jsonModel: {
            error: errMsg,
            timestamp: nowBogotaISOString(),
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
    const { documentId, filePath } = job.data;
    this.logger.error(
      `Job ${job.id} (Document ${documentId}) has failed permanently with ${err.message}`,
    );

    const movedTo = await this.moveToReviewFolder(filePath);

    // Update document state to MODEL_ERROR when all retries are exhausted
    try {
      await this.documentRepository.updateState(
        documentId,
        DocumentState.MODEL_ERROR,
        {
          jsonModel: {
            error: err.message,
            errorType: 'permanent_failure',
            timestamp: nowBogotaISOString(),
            attempts: job.attemptsMade,
            ...(movedTo ? { archivoMovido: movedTo } : {}),
          },
          rutaArchivo: movedTo,
        },
      );
      this.logger.log(
        `Document ${documentId} marked as MODEL_ERROR in database`,
      );
      // Estado terminal DEFINITIVO: BullMQ ya agotó todos los reintentos
      // (`@OnWorkerEvent('failed')` solo se dispara tras el último intento).
      await this.entryReportService.publicarEstadoTerminal(
        documentId,
        DocumentState.MODEL_ERROR,
      );
    } catch (dbError: any) {
      const dbErrMsg =
        dbError instanceof Error ? dbError.message : String(dbError);
      this.logger.error(`Failed to update document state: ${dbErrMsg}`);
    }
  }

  /**
   * Mueve un archivo a la carpeta de revisión (OCR_UNREADABLE_PATH) cuando
   * un documento queda en estado de error terminal en la etapa de IA
   * (permanente o tras agotar reintentos), para que no quede huérfano en
   * OCR_PATH dentro del contenedor. Destino organizado por subcarpeta de
   * fecha (yyyyMMdd, hora Bogotá), igual que OCR_DESTINATION_PATH.
   */
  private async moveToReviewFolder(filePath?: string): Promise<string | null> {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }

    try {
      return await moverArchivoAFechaDestino(this.unreadablePath, filePath);
    } catch (moveErr: any) {
      this.logger.error(
        `No se pudo mover ${filePath} a la carpeta de revisión: ${moveErr.message}`,
      );
      return null;
    }
  }
}
