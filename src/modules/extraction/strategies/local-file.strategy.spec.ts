import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { LocalFileStrategy } from './local-file.strategy';
import { SIN_CORTE } from '@/common/utils/ruta-entrada.util';
import { carpetaFechaBogota } from '@/common/utils/file-destination.util';

/**
 * Crea un ConfigService fake respaldado por un objeto plano, suficiente
 * para lo que usa `LocalFileStrategy` (`get(key, default)`).
 */
function fakeConfigService(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  } as unknown as ConfigService;
}

/** Crea `filePath` (y sus carpetas padre) con contenido dummy. */
function crearArchivo(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'contenido');
}

describe('LocalFileStrategy', () => {
  let tmpRoot: string;
  let embargosRoot: string;
  let masivosRoot: string;
  let destino: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-file-strategy-'));
    embargosRoot = path.join(tmpRoot, 'embargos');
    masivosRoot = path.join(tmpRoot, 'masivos');
    destino = path.join(tmpRoot, 'destino');
    fs.mkdirSync(embargosRoot, { recursive: true });
    fs.mkdirSync(masivosRoot, { recursive: true });
    fs.mkdirSync(destino, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function crearEstrategia(overrides?: Record<string, string>): LocalFileStrategy {
    return new LocalFileStrategy(
      fakeConfigService({
        LOCAL_SOURCE_PATHS: [embargosRoot, masivosRoot].join(','),
        MASIVOS_SOURCE_PATH: masivosRoot,
        ALLOWED_EXTENSIONS: '.pdf',
        ...overrides,
      }),
    );
  }

  describe('descubrirGrupos', () => {
    it('no mueve ningun archivo, solo agrupa', async () => {
      const legacyFile = path.join(embargosRoot, 'suelto.pdf');
      crearArchivo(legacyFile);

      const strategy = crearEstrategia();
      const grupos = await strategy.descubrirGrupos();

      expect(fs.existsSync(legacyFile)).toBe(true);
      expect(grupos).toHaveLength(1);
      expect(grupos[0].archivos).toEqual([legacyFile]);
    });

    it('agrupa forma legacy (nivel 0) con fecha de hoy y SIN_CORTE', async () => {
      crearArchivo(path.join(embargosRoot, 'a.pdf'));

      const strategy = crearEstrategia();
      const [grupo] = await strategy.descubrirGrupos();

      expect(grupo.metadatos).toMatchObject({
        tipoOficio: 'EMBARGO',
        fechaEntrada: carpetaFechaBogota(),
        corte: SIN_CORTE,
        legacy: true,
      });
    });

    it('agrupa forma nueva sourceRoot/FECHA/CORTE_n', async () => {
      const archivo = path.join(embargosRoot, '20200805', 'CORTE_1', 'b.pdf');
      crearArchivo(archivo);

      const strategy = crearEstrategia();
      const grupos = await strategy.descubrirGrupos();

      expect(grupos).toHaveLength(1);
      expect(grupos[0].metadatos).toMatchObject({
        tipoOficio: 'EMBARGO',
        fechaEntrada: '20200805',
        corte: 'CORTE_1',
        legacy: false,
      });
      expect(grupos[0].archivos).toEqual([archivo]);
    });

    it('calcula hayCortesEnFecha inspeccionando el filesystem: archivo suelto en fecha con cortes se ignora', async () => {
      const archivoSuelto = path.join(embargosRoot, '20200805', 'suelto.pdf');
      const archivoEnCorte = path.join(
        embargosRoot,
        '20200805',
        'CORTE_1',
        'c.pdf',
      );
      crearArchivo(archivoSuelto);
      crearArchivo(archivoEnCorte);

      const strategy = crearEstrategia();
      const grupos = await strategy.descubrirGrupos();

      // El archivo suelto queda intacto (no se mueve, no aparece en ningun grupo).
      expect(fs.existsSync(archivoSuelto)).toBe(true);
      expect(grupos).toHaveLength(1);
      expect(grupos[0].archivos).toEqual([archivoEnCorte]);
    });

    it('agrupa forma legacy con fecha explicita cuando esa fecha no tiene cortes', async () => {
      const archivo = path.join(embargosRoot, '20200804', 'suelto.pdf');
      crearArchivo(archivo);

      const strategy = crearEstrategia();
      const [grupo] = await strategy.descubrirGrupos();

      expect(grupo.metadatos).toMatchObject({
        fechaEntrada: '20200804',
        corte: SIN_CORTE,
        legacy: true,
      });
    });

    it('carpeta con estructura invalida (corte en minuscula) se ignora y no se mueve', async () => {
      const archivoInvalido = path.join(
        embargosRoot,
        '20200805',
        'corte_1',
        'd.pdf',
      );
      crearArchivo(archivoInvalido);

      const strategy = crearEstrategia();
      const grupos = await strategy.descubrirGrupos();

      expect(grupos).toHaveLength(0);
      expect(fs.existsSync(archivoInvalido)).toBe(true);
    });

    it('ordena: legacy de raiz primero, luego por fecha y numeroCorte ascendentes', async () => {
      crearArchivo(path.join(embargosRoot, 'raiz.pdf'));
      crearArchivo(
        path.join(embargosRoot, '20200805', 'CORTE_10', 'x.pdf'),
      );
      crearArchivo(path.join(embargosRoot, '20200805', 'CORTE_2', 'y.pdf'));
      crearArchivo(path.join(embargosRoot, '20200804', 'CORTE_1', 'z.pdf'));

      const strategy = crearEstrategia();
      const grupos = await strategy.descubrirGrupos();

      expect(
        grupos.map((g) => `${g.metadatos.fechaEntrada}/${g.metadatos.corte}`),
      ).toEqual([
        `${carpetaFechaBogota()}/${SIN_CORTE}`,
        '20200804/CORTE_1',
        '20200805/CORTE_2',
        '20200805/CORTE_10',
      ]);
    });

    it('usa MASIVOS_ALLOWED_EXTENSIONS para el root de masivos, ignorando ALLOWED_EXTENSIONS', async () => {
      crearArchivo(path.join(masivosRoot, 'carga.xlsx'));
      crearArchivo(path.join(masivosRoot, 'reservado.pdf'));

      const strategy = crearEstrategia();
      const grupos = await strategy.descubrirGrupos();

      const archivos = grupos.flatMap((g) => g.archivos);
      expect(archivos.some((a) => a.endsWith('carga.xlsx'))).toBe(true);
      expect(archivos.some((a) => a.endsWith('reservado.pdf'))).toBe(false);
      expect(fs.existsSync(path.join(masivosRoot, 'reservado.pdf'))).toBe(true);
    });

    it('filtra por tipoOficio/fechaEntrada/corte cuando se pasa filtro', async () => {
      crearArchivo(path.join(embargosRoot, '20200805', 'CORTE_1', 'a.pdf'));
      crearArchivo(path.join(embargosRoot, '20200806', 'CORTE_1', 'b.pdf'));

      const strategy = crearEstrategia();
      const grupos = await strategy.descubrirGrupos({
        fechaEntrada: '20200805',
      });

      expect(grupos).toHaveLength(1);
      expect(grupos[0].metadatos.fechaEntrada).toBe('20200805');
    });

    it('omite archivos ocultos', async () => {
      crearArchivo(path.join(embargosRoot, '.oculto.pdf'));

      const strategy = crearEstrategia();
      const grupos = await strategy.descubrirGrupos();

      expect(grupos).toHaveLength(0);
    });
  });

  describe('moverArchivos', () => {
    it('mueve los archivos del grupo al destino conservando el nombre y rellena metadatos', async () => {
      const archivo = path.join(embargosRoot, '20200805', 'CORTE_1', 'e.pdf');
      crearArchivo(archivo);

      const strategy = crearEstrategia();
      const [grupo] = await strategy.descubrirGrupos();
      const movidos = await strategy.moverArchivos(grupo, destino);

      expect(fs.existsSync(archivo)).toBe(false);
      expect(fs.existsSync(path.join(destino, 'e.pdf'))).toBe(true);
      expect(movidos).toEqual([
        {
          name: 'e.pdf',
          originalPath: archivo,
          destinationPath: path.join(destino, 'e.pdf'),
          metadatos: grupo.metadatos,
        },
      ]);
    });
  });

  describe('extractFiles', () => {
    it('descubre y mueve todo de una vez (comportamiento previo)', async () => {
      crearArchivo(path.join(embargosRoot, '20200805', 'CORTE_1', 'f.pdf'));
      crearArchivo(path.join(embargosRoot, 'suelto.pdf'));

      const strategy = crearEstrategia();
      const extraidos = await strategy.extractFiles(destino);

      expect(extraidos).toHaveLength(2);
      expect(fs.existsSync(path.join(destino, 'f.pdf'))).toBe(true);
      expect(fs.existsSync(path.join(destino, 'suelto.pdf'))).toBe(true);
    });
  });
});
