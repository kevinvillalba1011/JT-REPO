import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { DocumentState } from '@prisma/client';
import { EntryLoteFilterDto } from './entry-lote-filter.dto';

export class GetDocumentsDto extends EntryLoteFilterDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Filter by state', enum: DocumentState })
  @IsOptional()
  @IsEnum(DocumentState)
  state?: DocumentState;
}
