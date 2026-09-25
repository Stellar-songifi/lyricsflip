import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordGenrePlayDto {
  @ApiProperty({ description: 'Score for the round, 0-100' })
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;

  @ApiPropertyOptional({ description: 'Optional 0-5 enjoyment rating' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  enjoymentRating?: number;
}
