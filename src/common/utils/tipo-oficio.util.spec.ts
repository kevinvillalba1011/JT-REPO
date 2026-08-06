import { demandanteCoactivoPorDefecto } from './tipo-oficio.util';

describe('demandanteCoactivoPorDefecto', () => {
  it('inyecta un demandante derivado del ente cuando es COACTIVO y demandantes viene vacío', () => {
    const resultado = demandanteCoactivoPorDefecto(
      'COACTIVO',
      'DIAN SECCIONAL BOGOTA',
      [],
    );
    expect(resultado).toEqual({
      accion: 'inyectar',
      demandantes: [
        { tipoId: '0', numeroId: '0', nombre: 'DIAN SECCIONAL BOGOTA' },
      ],
    });
  });

  it('respeta un demandante ya extraído por el modelo, sin importar el tipoProceso', () => {
    const resultado = demandanteCoactivoPorDefecto(
      'COACTIVO',
      'DIAN SECCIONAL BOGOTA',
      [{ tipoId: 'N', numeroId: '900123456', nombre: 'ACREEDOR SA' }],
    );
    expect(resultado).toEqual({ accion: 'sin-cambios' });
  });

  it('no hace nada si el proceso es JUDICIAL, aunque demandantes venga vacío', () => {
    const resultado = demandanteCoactivoPorDefecto(
      'JUDICIAL',
      'JUZGADO 5 CIVIL DEL CIRCUITO',
      [],
    );
    expect(resultado).toEqual({ accion: 'sin-cambios' });
  });

  it('devuelve sin-ente cuando es COACTIVO pero tampoco hay nombre de ente embargante', () => {
    const resultado = demandanteCoactivoPorDefecto('COACTIVO', '0', []);
    expect(resultado.accion).toBe('sin-ente');
  });

  it('devuelve sin-ente cuando el nombre del ente está vacío', () => {
    const resultado = demandanteCoactivoPorDefecto('COACTIVO', '', undefined);
    expect(resultado.accion).toBe('sin-ente');
  });

  it('no hace nada si demandantes no es un array', () => {
    const resultado = demandanteCoactivoPorDefecto(
      'COACTIVO',
      'DIAN SECCIONAL BOGOTA',
      undefined,
    );
    expect(resultado).toEqual({
      accion: 'inyectar',
      demandantes: [
        { tipoId: '0', numeroId: '0', nombre: 'DIAN SECCIONAL BOGOTA' },
      ],
    });
  });

  it('ignora demandantes con nombre vacío o SIN_DATO al decidir si ya hay uno válido', () => {
    const resultado = demandanteCoactivoPorDefecto('COACTIVO', 'ENTE X', [
      { tipoId: '0', numeroId: '0', nombre: '0' },
      { tipoId: 'C', numeroId: '123', nombre: '' },
    ]);
    expect(resultado).toEqual({
      accion: 'inyectar',
      demandantes: [{ tipoId: '0', numeroId: '0', nombre: 'ENTE X' }],
    });
  });
});
