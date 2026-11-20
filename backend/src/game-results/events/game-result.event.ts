export class GameResultCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly gameId: string,
    public readonly score: number,
    public readonly achievements: any[],
    public readonly correctAnswers?: number,
    public readonly totalAnswers?: number,
  ) {}
}
