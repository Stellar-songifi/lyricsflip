import { IsInt, IsUUID, Max, Min } from 'class-validator';

/**
 * Deliberately has no timing or score fields: the server measures response
 * time itself and decides the score.
 */
export class SubmitAnswerDto {
  @IsUUID()
  questionId: string;

  @IsInt()
  @Min(0)
  @Max(3)
  answerIndex: number;
}
