import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../../user/user.entity';

/** A rule set created by a player, as opposed to the built-in modes in `game-modes/`. */
@Entity('custom_game_modes')
export class CustomGameMode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('json')
  rules: {
    timeLimit: number;
    pointSystem: Record<string, number>;
    powerUpsAllowed: string[];
    minimumPlayers: number;
    specialConditions: string[];
  };

  @Column()
  isPublic: boolean;

  @Column({ default: 0 })
  votes: number;

  @ManyToOne(() => User, { nullable: true })
  creator: User;

  @CreateDateColumn()
  createdAt: Date;
}
