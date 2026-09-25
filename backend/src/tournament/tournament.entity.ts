import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  OneToMany,
  JoinTable,
} from 'typeorm';
import { User } from '../user/user.entity';
import { GameSession } from '../game-session/game-session.entity';

@Entity()
export class Tournament {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('timestamp')
  startTime: Date;

  @Column('timestamp')
  endTime: Date;

  @Column('json', { nullable: true })
  rules: Record<string, any>;

  @ManyToMany(() => User, { eager: true })
  @JoinTable()
  participants: User[];

  @OneToMany(() => GameSession, (gameSession) => gameSession.tournament)
  matches: GameSession[];
}
