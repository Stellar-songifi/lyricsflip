// src/replay-analysis/entities/pattern.entity.ts
@Entity('patterns')
export class Pattern {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  replayId: string;

  @ManyToOne(() => Replay, replay => replay.patterns)
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
  confidence: string;

  @Column('jsonb')
  data: any;

  @Column('float', { nullable: true })
  frequency?: number;

  @Column({ default: false })
  isCommon: boolean;

  @CreateDateColumn()
  createdAt: Date;
}