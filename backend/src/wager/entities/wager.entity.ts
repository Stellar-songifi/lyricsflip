import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Lifecycle of a wager, as observed from indexed on-chain state (see
 * `onchain/contracts/lyricsflip/src/lib.rs`'s `Round`):
 *  - escrowed: the player joined a wagered round; funds are held by the contract.
 *  - won / lost: the round completed (`RoundCompleted`) and this player was/was not among the winners.
 *  - refunded: the round was cancelled (`RoundCancelled`) and the wager was returned.
 *  - claimed: the player withdrew their winnings from the contract.
 */
export enum WagerStatus {
  ESCROWED = 'escrowed',
  WON = 'won',
  LOST = 'lost',
  REFUNDED = 'refunded',
  CLAIMED = 'claimed',
}

/**
 * A read-only projection of a wager placed on-chain. Rows are written by the
 * indexer (`IndexerService`, LF-088) as it decodes `RoundJoined`,
 * `RoundCompleted` and `RoundCancelled` events — never by a client request.
 * Placing a wager and claiming winnings both happen in the user's wallet by
 * calling the contract directly (see LF-087).
 */
@Entity('wagers')
export class Wager {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Matches `Round.round_id` on-chain. Stored as text since it is a u64.
  @Column()
  @Index()
  roundId: string;

  // Stellar account address (G...) of the player who placed the wager.
  @Column()
  @Index()
  player: string;

  // Wager amount in the asset's base units (matches the contract's i128
  // `wager_amount`). Stored as a numeric string to avoid precision loss.
  @Column('numeric', { precision: 39, scale: 0 })
  amount: string;

  // Asset code, or 'native' for XLM.
  @Column({ default: 'native' })
  asset: string;

  // Hash of the transaction that last changed this wager's status.
  @Column({ nullable: true })
  txHash: string | null;

  @Column({ type: 'enum', enum: WagerStatus, default: WagerStatus.ESCROWED })
  status: WagerStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
