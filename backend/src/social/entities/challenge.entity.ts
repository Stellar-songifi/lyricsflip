import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ChallengeType {
  SCORE = 'score',
  STREAK = 'streak',
  SPEED = 'speed',
  GENRE = 'genre',
}

export enum ChallengeStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

@Entity('challenges')
export class Challenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ChallengeType,
  })
  type: ChallengeType;

  @Column('simple-array')
  participants: string[];

  @Column()
  deadline: Date;

  @Column('json', { nullable: true })
  reward: any;

  @Column({
    type: 'enum',
    enum: ChallengeStatus,
    default: ChallengeStatus.PENDING,
  })
  status: ChallengeStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
