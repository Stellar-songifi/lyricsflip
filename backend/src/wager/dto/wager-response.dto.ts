import { ApiProperty } from '@nestjs/swagger';
import { WagerStatus } from '../entities/wager.entity';

export class WagerResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  roundId: string;

  @ApiProperty()
  player: string;

  @ApiProperty({ description: "Amount in the asset's base units" })
  amount: string;

  @ApiProperty()
  asset: string;

  @ApiProperty({ nullable: true })
  txHash: string | null;

  @ApiProperty({ enum: WagerStatus })
  status: WagerStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedWagersDto {
  @ApiProperty({ type: [WagerResponseDto] })
  data: WagerResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}
