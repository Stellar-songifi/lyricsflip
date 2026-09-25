import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tournament } from './tournament.entity';
import { Player } from '../player/player.entity';
import { GameSession } from '@app/game-session/game-session.entity';
import { SchedulingService } from './scheduling.service';

@Injectable()
export class TournamentService {
  constructor(
    @InjectRepository(Tournament)
    private tournamentRepository: Repository<Tournament>,

    @InjectRepository(Player)
    private playerRepository: Repository<Player>,

    @InjectRepository(GameSession)
    private gameSessionRepository: Repository<GameSession>,

    private schedulingService: SchedulingService,
  ) {}

  async createTournament(
    name: string,
    startTime: Date,
    endTime: Date,
    rules: Record<string, any>,
    participantIds: string[],
  ): Promise<Tournament> {
    const participants = await this.playerRepository.find({
      where: participantIds.map((id) => ({ id })),
    });
    const tournament = this.tournamentRepository.create({
      name,
      startTime,
      endTime,
      rules,
      participants,
    });
    return this.tournamentRepository.save(tournament);
  }

  async scheduleMatches(tournamentId: string): Promise<GameSession[]> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['participants'],
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const matches = await this.schedulingService.schedule(tournament);
    return this.gameSessionRepository.save(matches);
  }

  async applyScoring(tournamentId: string): Promise<void> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['matches'],
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    tournament.matches.forEach((match) => {
      this.applyMatchScoringRules(match);
    });

    await this.gameSessionRepository.save(tournament.matches);
  }

  private applyMatchScoringRules(match: GameSession) {
    if (match.players.length === 2) {
      const [player1, player2] = match.players;
    }
  }
}
