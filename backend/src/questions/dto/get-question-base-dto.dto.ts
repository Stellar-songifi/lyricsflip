import { IsDate, IsOptional } from 'class-validator';

import { IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@app/common/pagination/pagination-query-dto.dto';

class GetQuestionBaseDto {
  @IsDate()
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @IsOptional()
  endDate?: Date;
}

export class GetQuestionDto extends IntersectionType(
  GetQuestionBaseDto,
  PaginationQueryDto,
) {}
