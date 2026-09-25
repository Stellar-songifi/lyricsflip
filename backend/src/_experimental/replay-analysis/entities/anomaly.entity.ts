// src/replay-analysis/entities/anomaly.entity.ts
@Entity('anomalies')
export class Anomaly {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  replayId: string;

  @ManyToOne(() => Replay, replay => replay.anomalies)
  replay: Replay;

  @Column()
  playerId: string;

  @Column()
  type: string;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  severity: string;

  @Column('jsonb')
  data: any;

  @Column('float')
  confidenceScore: number;

  @Column('int', { nullable: true })
  timeIndexInReplay?: number;

  @Column({ default: false })
  isVerified: boolean;

  @CreateDateColumn()
  detectedAt: Date;

  @ManyToMany(() => Report, report => report.anomalies)
  reports: Report[];
}