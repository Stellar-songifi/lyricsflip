import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ChallengeType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
}

@Entity('challenges')
export class Challenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  creatorId: string;

  @Column({ type: 'enum', enum: ChallengeType, default: ChallengeType.DAILY })
  type: ChallengeType;

  @Column({ default: 'active' })
  status: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
