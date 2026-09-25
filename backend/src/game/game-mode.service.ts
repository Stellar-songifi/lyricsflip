import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ClassicModeService } from './game-modes/classic-mode.service';
import { TimeAttackModeService } from './game-modes/time-attack-mode.service';
import { EndlessModeService } from './game-modes/endless-mode.service';
import { BattleRoyaleModeService } from './game-modes/battle-royale-mode.service';
import { GameMode } from './interfaces/game-mode.interface';
import { GameResult } from './interfaces/game-result.interface';
import { GameStatsService } from './game-stats.service';
import { GameSessionService } from '../game-session/providers/game-session.service';
import { GameSession } from '../game-session/game-session.entity';

/** Registry of built-in game modes, and the start/end lifecycle of their sessions. */
@Injectable()
export class GameModeService implements OnModuleInit {
  private modes: Map<string, GameMode> = new Map();

  constructor(
    private readonly classicMode: ClassicModeService,
    private readonly timeAttackMode: TimeAttackModeService,
    private readonly endlessMode: EndlessModeService,
    private readonly battleRoyaleMode: BattleRoyaleModeService,
    private readonly gameSessionService: GameSessionService,
    private readonly gameStatsService: GameStatsService,
  ) {}

  onModuleInit() {
    for (const mode of [this.classicMode, this.timeAttackMode, this.endlessMode, this.battleRoyaleMode]) {
      mode.initialize();
      this.modes.set(mode.id, mode);
    }
  }

  getAllModes(): GameMode[] {
    return Array.from(this.modes.values());
  }

  getModeById(id: string): GameMode {
    const mode = this.modes.get(id);
    if (!mode) {
      throw new NotFoundException(`Game mode ${id} not found`);
    }
    return mode;
  }

  async startSession(modeId: string, players: string[]): Promise<GameSession> {
    const mode = this.getModeById(modeId);
    if (players.length < mode.minPlayers || players.length > mode.maxPlayers) {
      throw new Error(`Player count must be between ${mode.minPlayers} and ${mode.maxPlayers}`);
    }
    const session = await this.gameSessionService.start({
      gameMode: modeId,
      playerIds: players,
      maxPlayers: mode.maxPlayers,
    });
    mode.startGame(session.id, players);
    return session;
  }

  async endSession(sessionId: string): Promise<GameResult> {
    const session = await this.gameSessionService.findOne(sessionId);
    const result = this.getModeById(session.gameMode).endGame(sessionId);
    this.gameStatsService.updateStats(result);
    await this.gameSessionService.complete(sessionId, result, result.players[0]?.score);
    return result;
  }
}
