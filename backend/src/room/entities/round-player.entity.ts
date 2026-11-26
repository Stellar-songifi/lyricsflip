import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('round_players')
export class RoundPlayer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roundId: string;

  @Column()
  playerId: string;

  @Column({ nullable: true })
  score: number;

  @Column({ nullable: true })
  rank: number;

  @Column({ default: false })
  isActive: boolean;

  @CreateDateColumn()
  joinedAt: Date;
}
