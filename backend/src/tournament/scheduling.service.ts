import { Injectable } from '@nestjs/common';
import { GameSession } from '@app/game-session/game-session.entity';
import { Player } from '../player/player.entity';

@Injectable()
export class SchedulingService {
  schedule(tournament: any): GameSession[] {
    const participants: Player[] = tournament.participants;
    const matches: GameSession[] = [];

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const match = new GameSession();
        match.players = [participants[i], participants[j]];
        match.startTime = this.getMatchTime();
        matches.push(match);
      }
    }

    return matches;
  }

  private getMatchTime(): Date {
    return new Date();
  }
}
