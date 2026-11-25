import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateGameResultDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @IsNotEmpty()
  @IsUUID()
  gameId: string;

  @IsNotEmpty()
  @IsObject()
  gameData: any;

  @IsNumber()
  @IsOptional()
  score?: number;

  @IsNumber()
  timeSpent: number;

  @IsOptional()
  achievements?: any[];

  @IsNumber()
  @IsOptional()
  correctAnswers?: number;

  @IsNumber()
  @IsOptional()
  totalAnswers?: number;
}
