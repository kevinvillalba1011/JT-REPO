import * as path from 'path';
import { carpetaFechaBogota } from './file-destination.util';
import {
  SIN_CORTE,
  FID_FOLDER_NAME,
  esCorteValido,
  esFechaEntradaValida,
  normalizarTipoOficioCarpeta,
  numeroCorte,
  parsearRutaEntrada,
} from './ruta-entrada.util';

const SOURCE_ROOT = path.join('local', 'embargos');

describe('normalizarTipoOficioCarpeta', () => {
  it('mapea las carpetas plurales conocidas al vocabulario canonico', () => {
    expect(normalizarTipoOficioCarpeta('embargos')).toBe('EMBARGO');
    expect(normalizarTipoOficioCarpeta('desembargos')).toBe('DESEMBARGO');
    expect(normalizarTipoOficioCarpeta('alcances')).toBe('ALCANCE');
    expect(normalizarTipoOficioCarpeta('masivos')).toBe('MASIVO');
  });

  it('es case-insensitive', () => {
    expect(normalizarTipoOficioCarpeta('EMBARGOS')).toBe('EMBARGO');
    expect(normalizarTipoOficioCarpeta('Desembargos')).toBe('DESEMBARGO');
    expect(normalizarTipoOficioCarpeta('AlCancEs')).toBe('ALCANCE');
  });

  it('devuelve el nombre en mayusculas cuando no matchea ninguno conocido, sin lanzar', () => {
    expect(normalizarTipoOficioCarpeta('otra-cosa')).toBe('OTRA-COSA');
  });
});

describe('esCorteValido', () => {
  it('acepta CORTE_n en mayusculas estrictas', () => {
    expect(esCorteValido('CORTE_1')).toBe(true);
    expect(esCorteValido('CORTE_23')).toBe(true);
  });

  it('rechaza minusculas, variantes vacias o sin digitos', () => {
    expect(esCorteValido('corte_1')).toBe(false);
    expect(esCorteValido('CORTE_X')).toBe(false);
    expect(esCorteValido('CORTE_')).toBe(false);
    expect(esCorteValido('CORTE1')).toBe(false);
  });
});

describe('numeroCorte', () => {
  it('extrae el numero para ordenar numericamente, no lexicograficamente', () => {
    const cortes = ['CORTE_10', 'CORTE_2', 'CORTE_1'];
    const ordenados = [...cortes].sort((a, b) => numeroCorte(a) - numeroCorte(b));
    expect(ordenados).toEqual(['CORTE_1', 'CORTE_2', 'CORTE_10']);
  });

  it('devuelve MAX_SAFE_INTEGER cuando el nombre no matchea', () => {
    expect(numeroCorte('SIN_CORTE')).toBe(Number.MAX_SAFE_INTEGER);
    expect(numeroCorte('corte_1')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('esFechaEntradaValida', () => {
  it('acepta fechas reales en formato YYYYMMDD', () => {
    expect(esFechaEntradaValida('20200805')).toBe(true);
    expect(esFechaEntradaValida('20240229')).toBe(true); // bisiesto
  });

  it('rechaza formato incorrecto (longitud distinta a 8 digitos)', () => {
    expect(esFechaEntradaValida('2020805')).toBe(false);
    expect(esFechaEntradaValida('202008055')).toBe(false);
    expect(esFechaEntradaValida('abcdefgh')).toBe(false);
  });

  it('rechaza fechas que no existen', () => {
    expect(esFechaEntradaValida('20200230')).toBe(false); // febrero no tiene 30
    expect(esFechaEntradaValida('20230229')).toBe(false); // 2023 no es bisiesto
    expect(esFechaEntradaValida('20201301')).toBe(false); // mes 13
    expect(esFechaEntradaValida('20200000')).toBe(false); // mes/dia 00
  });
});

describe('parsearRutaEntrada', () => {
  it('ruta nueva valida: sourceRoot/FECHA/CORTE_n', () => {
    const dirPath = path.join(SOURCE_ROOT, '20200805', 'CORTE_1');
    const resultado = parsearRutaEntrada(SOURCE_ROOT, dirPath);
    expect(resultado).toEqual({
      tipoOficio: 'EMBARGO',
      fechaEntrada: '20200805',
      corte: 'CORTE_1',
      ruta: path.resolve(dirPath),
      legacy: false,
      prioritario: false,
    });
  });

  it('corte en minuscula -> null', () => {
    const dirPath = path.join(SOURCE_ROOT, '20200805', 'corte_1');
    expect(parsearRutaEntrada(SOURCE_ROOT, dirPath)).toBeNull();
  });

  it('CORTE_X y CORTE_ (sin digitos) -> null', () => {
    expect(
      parsearRutaEntrada(SOURCE_ROOT, path.join(SOURCE_ROOT, '20200805', 'CORTE_X')),
    ).toBeNull();
    expect(
      parsearRutaEntrada(SOURCE_ROOT, path.join(SOURCE_ROOT, '20200805', 'CORTE_')),
    ).toBeNull();
  });

  it('fecha con 7 digitos -> null', () => {
    const dirPath = path.join(SOURCE_ROOT, '2020805', 'CORTE_1');
    expect(parsearRutaEntrada(SOURCE_ROOT, dirPath)).toBeNull();
  });

  it('fecha con dia inexistente (20200230) -> null', () => {
    const dirPath = path.join(SOURCE_ROOT, '20200230', 'CORTE_1');
    expect(parsearRutaEntrada(SOURCE_ROOT, dirPath)).toBeNull();
  });

  it('root del tipo (profundidad 0): legacy con fecha de hoy y SIN_CORTE', () => {
    const resultado = parsearRutaEntrada(SOURCE_ROOT, SOURCE_ROOT);
    expect(resultado).toEqual({
      tipoOficio: 'EMBARGO',
      fechaEntrada: carpetaFechaBogota(),
      corte: SIN_CORTE,
      ruta: path.resolve(SOURCE_ROOT),
      legacy: true,
      prioritario: false,
    });
  });

  it('sourceRoot/FECHA sin cortes (hayCortesEnFecha: false) -> legacy con esa fecha y SIN_CORTE', () => {
    const dirPath = path.join(SOURCE_ROOT, '20200804');
    const resultado = parsearRutaEntrada(SOURCE_ROOT, dirPath, {
      hayCortesEnFecha: false,
    });
    expect(resultado).toEqual({
      tipoOficio: 'EMBARGO',
      fechaEntrada: '20200804',
      corte: SIN_CORTE,
      ruta: path.resolve(dirPath),
      legacy: true,
      prioritario: false,
    });
  });

  it('sourceRoot/FECHA sin pasar opciones (default) se comporta igual que hayCortesEnFecha: false', () => {
    const dirPath = path.join(SOURCE_ROOT, '20200804');
    const resultado = parsearRutaEntrada(SOURCE_ROOT, dirPath);
    expect(resultado).toEqual({
      tipoOficio: 'EMBARGO',
      fechaEntrada: '20200804',
      corte: SIN_CORTE,
      ruta: path.resolve(dirPath),
      legacy: true,
      prioritario: false,
    });
  });

  it('sourceRoot/FECHA con hayCortesEnFecha: true -> null (archivo mal ubicado, pertenece a un corte)', () => {
    const dirPath = path.join(SOURCE_ROOT, '20200804');
    const resultado = parsearRutaEntrada(SOURCE_ROOT, dirPath, {
      hayCortesEnFecha: true,
    });
    expect(resultado).toBeNull();
  });

  it('sourceRoot/FECHA con segmento de fecha invalido -> null, sin importar hayCortesEnFecha', () => {
    const dirPath = path.join(SOURCE_ROOT, 'no-es-fecha');
    expect(parsearRutaEntrada(SOURCE_ROOT, dirPath)).toBeNull();
    expect(
      parsearRutaEntrada(SOURCE_ROOT, dirPath, { hayCortesEnFecha: true }),
    ).toBeNull();
  });

  it('sourceRoot/FECHA/CORTE_n/FID -> mismo lote que CORTE_n, con prioritario: true', () => {
    const dirPath = path.join(
      SOURCE_ROOT,
      '20200805',
      'CORTE_1',
      FID_FOLDER_NAME,
    );
    const resultado = parsearRutaEntrada(SOURCE_ROOT, dirPath);
    expect(resultado).toEqual({
      tipoOficio: 'EMBARGO',
      fechaEntrada: '20200805',
      corte: 'CORTE_1',
      ruta: path.resolve(dirPath),
      legacy: false,
      prioritario: true,
    });
  });

  it('sourceRoot/FECHA/CORTE_n/<subcarpeta distinta de FID> -> null', () => {
    const dirPath = path.join(SOURCE_ROOT, '20200805', 'CORTE_1', 'extra');
    expect(parsearRutaEntrada(SOURCE_ROOT, dirPath)).toBeNull();
  });

  it('sourceRoot/FECHA/CORTE_n/fid (minuscula) -> null', () => {
    const dirPath = path.join(SOURCE_ROOT, '20200805', 'CORTE_1', 'fid');
    expect(parsearRutaEntrada(SOURCE_ROOT, dirPath)).toBeNull();
  });

  it('profundidad >= 4 -> null', () => {
    const dirPath = path.join(
      SOURCE_ROOT,
      '20200805',
      'CORTE_1',
      FID_FOLDER_NAME,
      'extra',
    );
    expect(parsearRutaEntrada(SOURCE_ROOT, dirPath)).toBeNull();
  });

  it('normaliza el tipoOficio a partir del basename de sourceRoot para otros tipos', () => {
    const desembargosRoot = path.join('local', 'desembargos');
    const dirPath = path.join(desembargosRoot, '20200805', 'CORTE_2');
    const resultado = parsearRutaEntrada(desembargosRoot, dirPath);
    expect(resultado?.tipoOficio).toBe('DESEMBARGO');
    expect(resultado?.corte).toBe('CORTE_2');
  });
});
