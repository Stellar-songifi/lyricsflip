import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  OneToMany,
  JoinTable,
} from 'typeorm';
import { ChatRoom } from '../chat-room/chat-room.entity';
import { GameSession } from '../game-session/game-session.entity';
import { PlayerRoom } from '../room/entities/player-room.entity';
import { PlayerStatus } from './enums/player-status.enum';

@Entity('players')
export class Player {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  username: string;

  @Column({ nullable: true })
  firstname: string;

  @Column({ nullable: true })
  lastname: string;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({
    type: 'enum',
    enum: PlayerStatus,
    default: PlayerStatus.OFFLINE,
  })
  status: PlayerStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => ChatRoom, (chatRoom) => chatRoom.players)
  chatRoom: ChatRoom;

  @ManyToMany(() => GameSession, (gameSession) => gameSession.players)
  @JoinTable()
  gameSessions: GameSession[];

  @OneToMany(() => PlayerRoom, (playerRoom) => playerRoom.player)
  playerRooms: PlayerRoom[];

  // In-memory game stats (not persisted).
  score: number;
  highestStreak: number;
  currentStreak: number;
}
