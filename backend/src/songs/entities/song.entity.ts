import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  Index,
} from 'typeorm';
import { Genre } from '../enums/genre.enum';
import { SongDifficulty } from '../enums/song-difficulty.enum';
import { Tag } from './tag.entity';

/**
 * Full curation lifecycle of a song card:
 *
 *   submitted ──► in_review ──► approved ──► on_chain
 *                     └──────► rejected
 *
 *  - submitted: a user or admin has proposed the card; excluded from public
 *    listings and not eligible for on-chain sync.
 *  - in_review: an admin has picked it up for review; still excluded from
 *    public listings.
 *  - approved: an admin has verified the license and content; the card will
 *    be included in the next POST /admin/songs/sync run.
 *  - on_chain: synced to the contract via add_cards (see SongSyncService);
 *    onChainCardId holds the id the contract returned.
 *  - rejected: the card was refused (bad license, policy violation, etc.);
 *    rejectionReason records why.
 *
 * Legacy values kept for backward compatibility with existing rows:
 *  - draft: equivalent to submitted; treated as submitted in all service
 *    logic (the initial migration used 'draft' before the full workflow
 *    was introduced).
 */
export enum SongStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  ON_CHAIN = 'on_chain',
  REJECTED = 'rejected',
}

/** Statuses that are not yet publicly visible. */
export const UNPUBLISHED_STATUSES: SongStatus[] = [
  SongStatus.DRAFT,
  SongStatus.SUBMITTED,
  SongStatus.IN_REVIEW,
  SongStatus.REJECTED,
];

/**
 * Off-chain copy of the contract `Card` (card_id, genre, artist, title, year,
 * lyrics) plus metadata the contract does not store.
 */
@Entity('songs')
@Index(['artist', 'title'], { unique: true })
export class Song {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Contract `card_id`. Null until the card has been added on-chain. */
  @Column({ type: 'bigint', unique: true, nullable: true })
  onChainCardId: string | null;

  @Column({ type: 'enum', enum: SongStatus, default: SongStatus.SUBMITTED })
  status: SongStatus;

  @Column({ type: 'enum', enum: Genre })
  genre: Genre;

  @Column()
  artist: string;

  @Column()
  title: string;

  @Column('int')
  year: number;

  /** The lyric snippet. See docs/content-policy.md for length limits. */
  @Column('text')
  lyrics: string;

  @Column({
    type: 'enum',
    enum: SongDifficulty,
    default: SongDifficulty.MEDIUM,
  })
  difficulty: SongDifficulty;

  @ManyToMany(() => Tag, (tag) => tag.songs, { eager: true })
  @JoinTable({ name: 'song_tags' })
  tags: Tag[];

  /** Where the lyric text came from, e.g. "Original demo lyrics (CC0)". */
  @Column('text')
  source: string;

  /**
   * SPDX identifier or `LicenseRef-<provider>` for licensed data.
   * Must be one of the values listed in ALLOWED_LICENSES
   * (songs/constants/allowed-licenses.ts), which mirrors docs/content-policy.md.
   */
  @Column()
  license: string;

  /**
   * UUID of the User who reviewed this card (set when status moves to
   * in_review, approved, or rejected). Stored as a plain UUID string to
   * avoid a cross-domain FK from Catalogue to Identity.
   */
  @Column({ type: 'uuid', nullable: true })
  reviewerId: string | null;

  /**
   * Human-readable reason recorded when an admin rejects a card.
   * Required on rejection; null for all other statuses.
   */
  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ default: 0 })
  playCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
