import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentRepository } from './repositories/document.repository';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { DocumentService } from './documents.service';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentsController],
  providers: [DocumentRepository, DocumentService],
  exports: [DocumentRepository, DocumentService],
})
export class DocumentsModule {}
