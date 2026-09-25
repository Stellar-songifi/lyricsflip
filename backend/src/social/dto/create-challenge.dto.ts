// dto/create-challenge.dto.ts
import { IsString, IsArray, IsDate, IsEnum, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ChallengeType } from '../entities/challenge.entity';

export class RewardDto {
  @IsString()
  type: string;

  @IsOptional()
  value?: number;
}

export class CreateChallengeDto {
  @IsEnum(ChallengeType)
  type: ChallengeType;

  @IsArray()
  @IsString({ each: true })
  participants: string[];

  @IsDate()
  @Type(() => Date)
  deadline: Date;

  @ValidateNested()
  @Type(() => RewardDto)
  reward: RewardDto;
}
