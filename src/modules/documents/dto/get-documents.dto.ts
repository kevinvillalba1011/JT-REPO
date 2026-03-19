import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min, IsDateString } from 'class-validator';
import { DocumentState } from '@prisma/client';

export class GetDocumentsDto {
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

  @ApiPropertyOptional({ description: 'Start date (ISO format)', example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO format)', example: '2026-03-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
