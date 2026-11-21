// src/replay-analysis/entities/replay.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Pattern } from './pattern.entity';
import { Anomaly } from './anomaly.entity';
import { Report } from './report.entity';

@Entity('replays')
export class Replay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  gameId: string;

  @Column()
  matchId: string;

  @Column('simple-array')
  playerIds: string[];

  @Column()
  gameVersion: string;

  @Column({ nullable: true })
  mapId?: string;

  @Column({ nullable: true })
  gameMode?: string;

  @Column('int')
  durationSeconds: number;

  @Column()
  storageUrl: string;

  @Column({ default: false })
  hasBeenAnalyzed: boolean;

  @CreateDateColumn()
  uploadedAt: Date;

  @Column({ nullable: true })
  analyzedAt?: Date;

  @OneToMany(() => Pattern, (pattern) => pattern.replay)
  patterns: Pattern[];

  @OneToMany(() => Anomaly, (anomaly) => anomaly.replay)
  anomalies: Anomaly[];

  @OneToMany(() => Report, (report) => report.replay)
  reports: Report[];
}
