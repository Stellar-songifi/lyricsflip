import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('indexer_state')
export class IndexerState {
  @PrimaryColumn({ name: 'contract_id', type: 'varchar', length: 128 })
  contractId!: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  cursor!: string | null;

  @Column({ name: 'last_ledger', type: 'integer', nullable: true })
  lastLedger!: number | null;

  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date;
}

@Entity('chain_round')
export class ChainRound {
  @PrimaryColumn({ name: 'round_id', type: 'varchar', length: 128 })
  roundId!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  admin!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  status!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  genre!: string | null;

  @Index()
  @Column({ name: 'created_ledger', type: 'integer', nullable: true })
  createdLedger!: number | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Index()
  @Column({ type: 'integer', nullable: true })
  ledger!: number | null;

  @Column({ name: 'tx_hash', type: 'varchar', length: 128, nullable: true })
  txHash!: string | null;
}

@Entity('chain_round_player')
@Unique('uq_chain_round_player_round_player', ['roundId', 'player'])
export class ChainRoundPlayer {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index()
  @Column({ name: 'round_id', type: 'varchar', length: 128 })
  roundId!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  player!: string;

  @Column({ type: 'boolean', default: false })
  ready!: boolean;

  @Column({ name: 'joined_ledger', type: 'integer', nullable: true })
  joinedLedger!: number | null;

  @Index()
  @Column({ type: 'integer', nullable: true })
  ledger!: number | null;

  @Column({ name: 'tx_hash', type: 'varchar', length: 128, nullable: true })
  txHash!: string | null;
}

@Entity('chain_answer')
@Unique('uq_chain_answer_round_player_card', ['roundId', 'player', 'cardIndex'])
export class ChainAnswer {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index()
  @Column({ name: 'round_id', type: 'varchar', length: 128 })
  roundId!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  player!: string;

  @Column({ name: 'card_index', type: 'integer' })
  cardIndex!: number;

  @Column({ type: 'boolean', default: false })
  correct!: boolean;

  @Column({ type: 'integer', default: 0 })
  points!: number;

  @Index()
  @Column({ type: 'integer', nullable: true })
  ledger!: number | null;

  @Column({ name: 'tx_hash', type: 'varchar', length: 128, nullable: true })
  txHash!: string | null;
}

@Entity('chain_round_result')
@Unique('uq_chain_round_result_round_player', ['roundId', 'player'])
export class ChainRoundResult {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index()
  @Column({ name: 'round_id', type: 'varchar', length: 128 })
  roundId!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  player!: string;

  @Column({ type: 'boolean', default: false })
  won!: boolean;

  @Column({ type: 'integer', default: 0 })
  points!: number;

  @Column({ name: 'correct_answers', type: 'integer', default: 0 })
  correctAnswers!: number;

  @Column({ name: 'total_answers', type: 'integer', default: 0 })
  totalAnswers!: number;

  @Column({ name: 'streak_after', type: 'integer', default: 0 })
  streakAfter!: number;

  @Index()
  @Column({ type: 'integer', nullable: true })
  ledger!: number | null;

  @Column({ name: 'tx_hash', type: 'varchar', length: 128, nullable: true })
  txHash!: string | null;
}

@Entity('chain_nft')
export class ChainNft {
  @PrimaryColumn({ name: 'token_id', type: 'varchar', length: 128 })
  tokenId!: string;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  owner!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  kind!: string | null;

  @Index()
  @Column({ type: 'integer', nullable: true })
  ledger!: number | null;

  @Column({ name: 'tx_hash', type: 'varchar', length: 128, nullable: true })
  txHash!: string | null;
}

@Entity('processed_event')
@Unique('uq_processed_event_contract_tx_index', [
  'contractId',
  'txHash',
  'eventIndex',
])
export class ProcessedEvent {
  @PrimaryColumn({ type: 'varchar', length: 384 })
  id!: string;

  @Index()
  @Column({ name: 'contract_id', type: 'varchar', length: 128 })
  contractId!: string;

  @Column({ name: 'tx_hash', type: 'varchar', length: 128 })
  txHash!: string;

  @Column({ name: 'event_index', type: 'integer' })
  eventIndex!: number;

  @Column({ name: 'event_name', type: 'varchar', length: 128, nullable: true })
  eventName!: string | null;

  @Index()
  @Column({ type: 'integer', nullable: true })
  ledger!: number | null;

  @Column({
    name: 'processed_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  processedAt!: Date;
}