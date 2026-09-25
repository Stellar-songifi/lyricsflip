import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Player } from '../player/player.entity';
import { Tournament } from '../tournament/tournament.entity';
import { GameStatus } from './enums/game-status.enum';

@Entity('game_sessions')
export class GameSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Id of the game mode that runs this session, e.g. `classic`. */
  @Column({ type: 'varchar', nullable: true })
  gameMode: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  startTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  endTime: Date | null;

  @Column({ type: 'enum', enum: GameStatus, default: GameStatus.IN_PROGRESS })
  status: GameStatus;

  @Column({ type: 'int', default: 4 })
  maxPlayers: number;

  @Column({ type: 'decimal', nullable: true })
  score: number | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  /** Free-form data, e.g. player ids and per-player results. */
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ nullable: true })
  description: string;

  @ManyToMany(() => Player, (player) => player.gameSessions, { cascade: true })
  players: Player[];

  @ManyToOne(() => Tournament, (tournament) => tournament.matches, { nullable: true })
  tournament: Tournament | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
