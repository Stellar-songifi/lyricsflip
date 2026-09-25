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

  @Column({ type: 'enum', enum: SongDifficulty, default: SongDifficulty.MEDIUM })
  difficulty: SongDifficulty;

  @ManyToMany(() => Tag, (tag) => tag.songs, { eager: true })
  @JoinTable({ name: 'song_tags' })
  tags: Tag[];

  /** Where the lyric text came from, e.g. "Original demo lyrics (CC0)". */
  @Column('text')
  source: string;

  /** SPDX identifier, or `LicenseRef-<provider>` for licensed data. */
  @Column()
  license: string;

  @Column({ default: 0 })
  playCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
