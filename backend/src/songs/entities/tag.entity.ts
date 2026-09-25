import { Entity, Column, PrimaryGeneratedColumn, ManyToMany } from 'typeorm';
import { Song } from './song.entity';

@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  category: string | null;

  @ManyToMany(() => Song, (song) => song.tags)
  songs: Song[];
}
