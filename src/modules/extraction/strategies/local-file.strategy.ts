import {
  FileExtractorStrategy,
  ExtractedFile,
  GrupoEntrada,
} from './file-extractor.strategy';
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import {
  MetadatosEntrada,
  SIN_CORTE,
  esCorteValido,
  numeroCorte,
  parsearRutaEntrada,
} from '@/common/utils/ruta-entrada.util';

/**
 * Extensiones permitidas EXCLUSIVAMENTE para la carpeta "masivos"
 * (MASIVOS_SOURCE_PATH): un PDF/imagen dejado ahí no debe ser recogido por
 * el escaneo individual (OCR/Gemini) — debe quedar "en espera" hasta que el
 * Excel correspondiente lo reclame por nombre (ver `MassiveExcelService`).
 * Mismo set que ya usa `OcrProcessor` para detectar archivos de carga
 * masiva (`.xlsx/.xls/.csv`).
 */
const MASIVOS_ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

/** Filtro opcional para `descubrirGrupos`, usado por un endpoint manual de relectura. */
export interface FiltroGrupoEntrada {
  tipoOficio?: string;
  fechaEntrada?: string;
  corte?: string;
}

@Injectable()
export class LocalFileStrategy implements FileExtractorStrategy {
  private readonly logger = new Logger(LocalFileStrategy.name);
  private readonly sourcePaths: string[];
  private readonly masivosSourcePath: string;

  constructor(private readonly configService: ConfigService) {
    const paths = this.configService.get<string>(
      'LOCAL_SOURCE_PATHS',
      './local/source',
    );
    this.sourcePaths = paths.split(',').map((p) => p.trim());
    this.masivosSourcePath = this.configService.get<string>(
      'MASIVOS_SOURCE_PATH',
      '',
    );
  }

  /**
   * Recorre las carpetas fuente (`LOCAL_SOURCE_PATHS`) y agrupa los archivos
   * encontrados por carpeta de entrada (`tipoOficio`/`fechaEntrada`/`corte`),
   * SIN moverlos ni tocarlos. Esto permite que el llamador cuente los
   * archivos de cada grupo antes de moverlos, para crear un registro de
   * lote en BD antes de mutar el filesystem.
   *
   * `filtro`, si viene, restringe el resultado a los grupos cuyos metadatos
   * coincidan exactamente (comparación contra los valores ya normalizados
   * por `parsearRutaEntrada`). Lo usa un endpoint manual de relectura.
   */
  async descubrirGrupos(filtro?: FiltroGrupoEntrada): Promise<GrupoEntrada[]> {
    this.logger.verbose(
      `Scanning local folders: ${this.sourcePaths.join(', ')}`,
    );

    const allowedExtensions = this.configService
      .get<string>('ALLOWED_EXTENSIONS', '')
      .split(',')
      .map((ext) => ext.trim().toLowerCase());

    const grupos: GrupoEntrada[] = [];

    for (const sourcePath of this.sourcePaths) {
      const existe = await this.existePath(sourcePath);
      if (!existe) {
        this.logger.warn(`Source path does not exist: ${sourcePath}`);
        continue;
      }

      // La carpeta "masivos" tiene una lista de extensiones propia: solo
      // Excel/CSV. PDFs/imágenes ahí quedan reservados para que
      // MassiveExcelService los reclame por nombre, en vez de ser
      // procesados en paralelo por el flujo individual.
      const isMasivosFolder =
        !!this.masivosSourcePath &&
        path.resolve(sourcePath) === path.resolve(this.masivosSourcePath);
      const extensionsForThisFolder = isMasivosFolder
        ? MASIVOS_ALLOWED_EXTENSIONS
        : allowedExtensions;

      const gruposDeEsteRoot = await this.descubrirGruposDeRoot(
        sourcePath,
        extensionsForThisFolder,
      );
      grupos.push(...gruposDeEsteRoot);
    }

    // Los grupos ya vienen ordenados (ver `descubrirGruposDeRoot`): legacy de
    // raíz primero, luego por fecha y corte ascendentes.
    if (!filtro) {
      return grupos;
    }

    return grupos.filter((grupo) => this.coincideFiltro(grupo.metadatos, filtro));
  }

  /**
   * Mueve los archivos de un grupo ya descubierto a `destinationFolder`,
   * conservando el nombre original. Se llama DESPUÉS de que el llamador ya
   * contó los archivos y creó su registro de lote en BD.
   */
  async moverArchivos(
    grupo: GrupoEntrada,
    destinationFolder: string,
  ): Promise<ExtractedFile[]> {
    const extractedFiles: ExtractedFile[] = [];

    for (const fullPath of grupo.archivos) {
      const name = path.basename(fullPath);
      const destinationPath = path.join(destinationFolder, name);

      try {
        // Mover (no copiar) el archivo fuera de la carpeta fuente: si solo se
        // copia, el archivo original sigue existiendo ahí y el siguiente tick
        // del cron lo vuelve a recoger como si fuera nuevo, generando
        // registros y jobs duplicados indefinidamente.
        try {
          await fs.promises.rename(fullPath, destinationPath);
        } catch {
          await fs.promises.copyFile(fullPath, destinationPath);
          await fs.promises.unlink(fullPath);
        }
        this.logger.log(
          `Moved file ${fullPath} to ${destinationFolder} as ${name}`,
        );
        extractedFiles.push({
          name,
          originalPath: fullPath,
          destinationPath,
          metadatos: grupo.metadatos,
        });
      } catch (err: any) {
        this.logger.error(`Failed to move file ${fullPath}: ${err.message}`);
      }
    }

    return extractedFiles;
  }

  /**
   * Wrapper delgado que conserva el comportamiento anterior (descubrir y
   * mover todo de una vez) para no romper al llamador actual mientras se
   * migra `ExtractionService` a usar `descubrirGrupos`/`moverArchivos` por
   * separado.
   */
  async extractFiles(destinationFolder: string): Promise<ExtractedFile[]> {
    const grupos = await this.descubrirGrupos();
    const extractedFiles: ExtractedFile[] = [];

    for (const grupo of grupos) {
      const movidos = await this.moverArchivos(grupo, destinationFolder);
      extractedFiles.push(...movidos);
    }

    return extractedFiles;
  }

  /**
   * Descubre los grupos de entrada de un solo root (ej. `.../local/embargos`).
   * Recorre acotado a los niveles que soporta `parsearRutaEntrada`:
   *   - Nivel 0: archivos sueltos en la raíz del tipo (legacy).
   *   - Nivel 1: sourceRoot/FECHA (legacy con fecha, o ignorado si esa fecha
   *     ya tiene subcarpetas CORTE_n).
   *   - Nivel 2: sourceRoot/FECHA/CORTE_n (forma nueva).
   *   - Nivel 3: sourceRoot/FECHA/CORTE_n/FID (mismo lote que el corte,
   *     marcado prioritario: true).
   * No desciende más allá del nivel 3: `parsearRutaEntrada` rechaza
   * cualquier profundidad >= 4.
   */
  private async descubrirGruposDeRoot(
    sourceRoot: string,
    allowedExtensions: string[],
  ): Promise<GrupoEntrada[]> {
    // Los grupos "legacy de raíz" (nivel 0, archivos sueltos en la raíz del
    // tipo) van siempre primero. El resto (legacy con fecha explícita a
    // nivel 1, y CORTE_n a nivel 2) se acumula aparte y se ordena por
    // fecha/corte antes de concatenar, para que el resultado final respete
    // el orden documentado sin que una carpeta de fecha que coincida con
    // "hoy" (fecha usada por el nivel 0) se confunda con un grupo de raíz.
    const gruposRaiz: GrupoEntrada[] = [];
    const gruposDatados: GrupoEntrada[] = [];

    // Nivel 0: archivos sueltos directamente en la raíz del tipo.
    const entradasRaiz = await this.leerDirectorio(sourceRoot);
    const archivosRaiz = this.filtrarArchivos(
      sourceRoot,
      entradasRaiz,
      allowedExtensions,
    );
    this.agregarGrupoSiAplica(gruposRaiz, sourceRoot, sourceRoot, archivosRaiz);

    const carpetasFecha = entradasRaiz.filter((entrada) =>
      entrada.isDirectory(),
    );

    for (const carpetaFecha of carpetasFecha) {
      const dirFecha = path.join(sourceRoot, carpetaFecha.name);
      const entradasFecha = await this.leerDirectorio(dirFecha);

      // hayCortesEnFecha lo calcula el llamador inspeccionando el
      // filesystem: si al menos una subcarpeta de esta fecha es un
      // CORTE_n válido, los archivos sueltos de esta carpeta de fecha se
      // consideran mal ubicados (parsearRutaEntrada los rechaza).
      const hayCortesEnFecha = entradasFecha.some(
        (entrada) => entrada.isDirectory() && esCorteValido(entrada.name),
      );

      // Nivel 1: sourceRoot/FECHA
      const archivosFecha = this.filtrarArchivos(
        dirFecha,
        entradasFecha,
        allowedExtensions,
      );
      this.agregarGrupoSiAplica(gruposDatados, sourceRoot, dirFecha, archivosFecha, {
        hayCortesEnFecha,
      });

      // Nivel 2: sourceRoot/FECHA/CORTE_n
      const carpetasCorte = entradasFecha.filter((entrada) =>
        entrada.isDirectory(),
      );
      for (const carpetaCorte of carpetasCorte) {
        const dirCorte = path.join(dirFecha, carpetaCorte.name);
        const entradasCorte = await this.leerDirectorio(dirCorte);
        const archivosCorte = this.filtrarArchivos(
          dirCorte,
          entradasCorte,
          allowedExtensions,
        );
        this.agregarGrupoSiAplica(
          gruposDatados,
          sourceRoot,
          dirCorte,
          archivosCorte,
        );

        // Nivel 3: sourceRoot/FECHA/CORTE_n/FID (mismo lote que CORTE_n,
        // pero prioritario: true — ver parsearRutaEntrada). Cualquier otra
        // subcarpeta que no sea exactamente "FID" es rechazada por
        // parsearRutaEntrada e ignorada por agregarGrupoSiAplica, igual que
        // ya pasa hoy con un CORTE_n mal escrito.
        const subcarpetasCorte = entradasCorte.filter((entrada) =>
          entrada.isDirectory(),
        );
        for (const subcarpeta of subcarpetasCorte) {
          const dirSubcarpeta = path.join(dirCorte, subcarpeta.name);
          const entradasSubcarpeta = await this.leerDirectorio(dirSubcarpeta);
          const archivosSubcarpeta = this.filtrarArchivos(
            dirSubcarpeta,
            entradasSubcarpeta,
            allowedExtensions,
          );
          this.agregarGrupoSiAplica(
            gruposDatados,
            sourceRoot,
            dirSubcarpeta,
            archivosSubcarpeta,
          );
        }
      }
    }

    gruposDatados.sort((a, b) => {
      const metaA = a.metadatos;
      const metaB = b.metadatos;

      if (metaA.fechaEntrada !== metaB.fechaEntrada) {
        return metaA.fechaEntrada < metaB.fechaEntrada ? -1 : 1;
      }

      // SIN_CORTE va antes que los CORTE_n de la misma fecha (aunque en la
      // práctica no coexisten: una fecha con CORTE_n nunca genera un grupo
      // SIN_CORTE, ver `hayCortesEnFecha` arriba). numeroCorte(SIN_CORTE)
      // es MAX_SAFE_INTEGER, así que se fuerza explícitamente a -1.
      const claveA = metaA.corte === SIN_CORTE ? -1 : numeroCorte(metaA.corte);
      const claveB = metaB.corte === SIN_CORTE ? -1 : numeroCorte(metaB.corte);
      if (claveA !== claveB) return claveA - claveB;

      // Mismo corte: el grupo prioritario (CORTE_n/FID) va primero.
      if (metaA.prioritario !== metaB.prioritario) {
        return metaA.prioritario ? -1 : 1;
      }
      return 0;
    });

    return [...gruposRaiz, ...gruposDatados];
  }

  /**
   * Interpreta `dirPath` con `parsearRutaEntrada` y, si es válido y hay
   * archivos, agrega el grupo. Si `parsearRutaEntrada` rechaza la carpeta
   * (`null`), loguea `warn` con la ruta y deja los archivos intactos: nunca
   * se mueven archivos de una carpeta que no matchea la estructura
   * soportada (la regla del nivel CORTE_n es estricta).
   */
  private agregarGrupoSiAplica(
    grupos: GrupoEntrada[],
    sourceRoot: string,
    dirPath: string,
    archivos: string[],
    opciones?: { hayCortesEnFecha?: boolean },
  ): void {
    if (archivos.length === 0) {
      return;
    }

    const metadatos = parsearRutaEntrada(sourceRoot, dirPath, opciones);
    if (!metadatos) {
      this.logger.warn(
        `Ignorando carpeta con estructura no soportada: ${dirPath} (no matchea [tipo_oficio]/[YYYYMMDD]/CORTE_[n] ni la forma legacy)`,
      );
      return;
    }

    grupos.push({ metadatos, archivos });
  }

  /** Lee un directorio con sus dirents, devolviendo `[]` si no existe. */
  private async leerDirectorio(dir: string): Promise<fs.Dirent[]> {
    try {
      return await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  /**
   * Filtra las entradas de tipo archivo de un directorio ya leído,
   * aplicando el filtro de extensión permitida y el skip de archivos
   * ocultos. Devuelve las rutas absolutas completas.
   */
  private filtrarArchivos(
    dir: string,
    entradas: fs.Dirent[],
    allowedExtensions: string[],
  ): string[] {
    const archivos: string[] = [];

    for (const entrada of entradas) {
      if (entrada.isDirectory()) continue;
      if (entrada.name.startsWith('.')) continue; // skip hidden files

      const ext = path.extname(entrada.name).toLowerCase();
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        this.logger.debug(
          `Skipping file ${entrada.name}: Extension ${ext} not allowed.`,
        );
        continue;
      }

      archivos.push(path.join(dir, entrada.name));
    }

    return archivos;
  }

  private async existePath(p: string): Promise<boolean> {
    try {
      await fs.promises.access(p);
      return true;
    } catch {
      return false;
    }
  }

  private coincideFiltro(
    metadatos: MetadatosEntrada,
    filtro: FiltroGrupoEntrada,
  ): boolean {
    if (filtro.tipoOficio && metadatos.tipoOficio !== filtro.tipoOficio) {
      return false;
    }
    if (filtro.fechaEntrada && metadatos.fechaEntrada !== filtro.fechaEntrada) {
      return false;
    }
    if (filtro.corte && metadatos.corte !== filtro.corte) {
      return false;
    }
    return true;
  }
}
