import { IsDate, IsOptional } from 'class-validator';

import { IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@app/common/pagination/pagination-query-dto.dto';

class GetUsersBaseDto {
  @IsDate()
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @IsOptional()
  endDate?: Date;
}

export class GetUsersDto extends IntersectionType(
  GetUsersBaseDto,
  PaginationQueryDto,
) {}
