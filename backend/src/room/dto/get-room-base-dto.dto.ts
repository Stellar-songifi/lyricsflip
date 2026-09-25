import { IsDate, IsOptional } from 'class-validator';

import { IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@app/common/pagination/pagination-query-dto.dto';

class GetRoomBaseDto {
  @IsDate()
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @IsOptional()
  endDate?: Date;
}

export class GetRoomDto extends IntersectionType(
  GetRoomBaseDto,
  PaginationQueryDto,
) {}
