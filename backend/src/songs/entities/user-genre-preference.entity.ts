import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Genre } from '../enums/genre.enum';

@Entity('user_genre_preferences')
@Index(['userId', 'genre'], { unique: true })
export class UserGenrePreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: Genre })
  genre: Genre;

  @Column('float', { default: 0 })
  preferenceScore: number;

  @Column('int', { default: 0 })
  playCount: number;

  @Column('float', { default: 0 })
  averagePerformance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
