import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EntryReportExcelService } from './entry-report-excel.service';
import { EntryReportRepository } from './repositories/entry-report.repository';
import { PrismaService } from '@/common/prisma/prisma.service';
import { EntryReport } from '@prisma/client';

function buildLote(overrides: Partial<EntryReport> = {}): EntryReport {
  return {
    id: 'id-1',
    fechaCreacion: new Date(),
    tipoOficio: 'EMBARGO',
    fechaEntrada: '20200805',
    corte: 'CORTE_1',
    ruta: '/ruta',
    numeroDocumentosEntrada: 2,
    numeroDocumentosProcesados: 2,
    numeroDocumentosError: 0,
    reporteGeneradoEn: null,
    reporteRuta: null,
    ...overrides,
  } as EntryReport;
}

describe('EntryReportExcelService', () => {
  let service: EntryReportExcelService;
  let repository: jest.Mocked<
    Pick<
      EntryReportRepository,
      'findPorFechaYCorte' | 'marcarReporteGenerado' | 'findCerradosSinReporte'
    >
  >;
  let prisma: { document: { findMany: jest.Mock } };

  beforeEach(async () => {
    repository = {
      findPorFechaYCorte: jest.fn(),
      marcarReporteGenerado: jest.fn(),
      findCerradosSinReporte: jest.fn(),
    };
    prisma = { document: { findMany: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntryReportExcelService,
        { provide: EntryReportRepository, useValue: repository },
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, def: string) => def },
        },
      ],
    }).compile();

    service = module.get<EntryReportExcelService>(EntryReportExcelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('retorna null si no hay lotes para la fecha+corte', async () => {
    repository.findPorFechaYCorte.mockResolvedValue([]);

    const resultado = await service.generarReporte('20200805', 'CORTE_1');

    expect(resultado).toBeNull();
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('retorna null (sin escribir nada) si algún lote del corte sigue abierto y no se forzó', async () => {
    repository.findPorFechaYCorte.mockResolvedValue([
      buildLote({ id: 'a', tipoOficio: 'EMBARGO' }),
      buildLote({
        id: 'b',
        tipoOficio: 'DESEMBARGO',
        numeroDocumentosEntrada: 5,
        numeroDocumentosProcesados: 3,
        numeroDocumentosError: 0,
      }),
    ]);

    const resultado = await service.generarReporte('20200805', 'CORTE_1');

    expect(resultado).toBeNull();
    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(repository.marcarReporteGenerado).not.toHaveBeenCalled();
  });

  it('genera el reporte cuando todos los lotes del corte están cerrados', async () => {
    repository.findPorFechaYCorte.mockResolvedValue([buildLote({ id: 'a' })]);
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        entryReportId: 'a',
        fileName: 'archivo1.pdf',
        nombreOficioFinal: 'FINAL-1',
        tipoOficio: 'EMBARGO',
      },
    ]);
    repository.marcarReporteGenerado.mockResolvedValue(undefined);

    const resultado = await service.generarReporte('20200805', 'CORTE_1');

    expect(resultado).not.toBeNull();
    expect(resultado?.filas).toBe(1);
    expect(resultado?.ruta).toContain(
      require('path').join('reporte_entrada', '20200805', 'CORTE_1.xlsx'),
    );
    expect(repository.marcarReporteGenerado).toHaveBeenCalledWith(
      ['a'],
      resultado?.ruta,
    );
  });

  it('con forzar=true genera el reporte aunque haya lotes abiertos', async () => {
    repository.findPorFechaYCorte.mockResolvedValue([
      buildLote({
        id: 'a',
        numeroDocumentosEntrada: 5,
        numeroDocumentosProcesados: 1,
        numeroDocumentosError: 0,
      }),
    ]);
    prisma.document.findMany.mockResolvedValue([]);
    repository.marcarReporteGenerado.mockResolvedValue(undefined);

    const resultado = await service.generarReporte('20200805', 'CORTE_1', {
      forzar: true,
    });

    expect(resultado).not.toBeNull();
    expect(resultado?.filas).toBe(0);
  });
});
