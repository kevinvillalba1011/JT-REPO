import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DocumentService } from './documents.service';
import { GetDocumentsDto } from './dto/get-documents.dto';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentService) {}

  @Get()
  @ApiOperation({ summary: 'List all documents' })
  @ApiResponse({ status: 200, description: 'Return all documents.' })
  async findAll(@Query() query: GetDocumentsDto) {
    return this.documentsService.findAll(query);
  }
}
