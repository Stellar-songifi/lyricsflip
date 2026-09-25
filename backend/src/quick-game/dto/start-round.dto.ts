import { IsInt, Max, Min } from 'class-validator';

export class StartRoundDto {
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty: number;

  @IsInt()
  @Min(1)
  @Max(20)
  count: number;
}
