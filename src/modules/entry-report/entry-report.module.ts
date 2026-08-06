import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/common/prisma/prisma.module';
import { EntryReportRepository } from './repositories/entry-report.repository';
import { EntryReportService } from './entry-report.service';
import { EntryReportExcelService } from './entry-report-excel.service';
import { ConteoOkProcessor } from './processors/conteo-ok.processor';
import { ConteoErrorProcessor } from './processors/conteo-error.processor';
import { EntryReportController } from './entry-report.controller';
import { EntryReportManualService } from './entry-report-manual.service';
import { LocalFileStrategy } from '../extraction/strategies/local-file.strategy';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    PrismaModule,
    DocumentsModule,
    BullModule.registerQueue(
      { name: 'cola_conteo_ok' },
      { name: 'cola_conteo_error' },
      // Requeridas por EntryReportManualService para encolar los archivos
      // releídos manualmente (mismas colas que usa ExtractionService).
      { name: 'cola_ocr' },
      { name: 'cola_masivos' },
    ),
  ],
  controllers: [EntryReportController],
  providers: [
    EntryReportRepository,
    EntryReportService,
    EntryReportExcelService,
    ConteoOkProcessor,
    ConteoErrorProcessor,
    EntryReportManualService,
    // LocalFileStrategy se provee acá en vez de importarla desde
    // ExtractionModule: ExtractionModule ya importa EntryReportModule (para
    // EntryReportService/EntryReportRepository), así que importar
    // ExtractionModule de vuelta acá crearía una dependencia circular entre
    // módulos. LocalFileStrategy es un `@Injectable()` sin estado (solo
    // depende de ConfigService para leer rutas de configuración en cada
    // llamada), así que instanciarla una segunda vez en este módulo es
    // inocuo: no hay estado compartido que se pierda entre las dos
    // instancias. Si en el futuro se le agrega estado propio, esto debe
    // revisarse (o exportarla desde ExtractionModule y usar forwardRef acá).
    LocalFileStrategy,
  ],
  // Exportados para que otros módulos (extraction, model, ocr) puedan
  // inyectar EntryReportService (para publicarEstadoTerminal) o el
  // repositorio (para upsertPorClave al descubrir un lote nuevo).
  // EntryReportExcelService se exporta para que un futuro endpoint manual de
  // relectura (opciones.forzar) pueda inyectarlo desde otro módulo.
  exports: [EntryReportService, EntryReportRepository, EntryReportExcelService],
})
export class EntryReportModule {}
