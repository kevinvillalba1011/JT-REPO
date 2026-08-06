import { Logger } from '@nestjs/common';
import { MetadatosEntrada } from '@/common/utils/ruta-entrada.util';

export interface ExtractedFile {
  name: string;
  originalPath: string; // or identifier
  destinationPath: string; // where it was downloaded/moved to
  /** Metadatos de la carpeta de entrada (tipo de oficio, fecha, corte) de donde vino este archivo. */
  metadatos: MetadatosEntrada;
}

/**
 * Un grupo de archivos que comparten la misma carpeta de entrada (mismo
 * `tipoOficio`/`fechaEntrada`/`corte`). El descubrimiento se separa del
 * movimiento porque el llamador necesita CONTAR los archivos de cada grupo
 * antes de moverlos, para crear un registro de lote en BD.
 */
export interface GrupoEntrada {
  metadatos: MetadatosEntrada;
  archivos: string[]; // rutas absolutas de los archivos de esa carpeta
}

export interface FileExtractorStrategy {
  extractFiles(destinationFolder: string): Promise<ExtractedFile[]>;
}
