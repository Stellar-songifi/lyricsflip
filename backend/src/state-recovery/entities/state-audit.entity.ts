import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { GameState } from './game-state.entity';

@Entity()
export class StateAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => GameState)
  gameState: GameState;

  @Column()
  action: string;

  @Column('json')
  previousState: any;

  @Column('json')
  newState: any;

  @Column()
  triggeredBy: string;

  @CreateDateColumn()
  timestamp: Date;
}
