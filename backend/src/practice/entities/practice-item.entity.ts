// src/practice/entities/practice-item.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToMany, JoinTable } from 'typeorm';
import { Difficulty } from '../enums/difficulty.enum';
import { Genre } from '../../songs/enums/genre.enum';
import { ItemType } from '../enums/item-type.enum';

@Entity()
export class PracticeItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: ItemType })
  type: ItemType;

  @Column({ type: 'enum', enum: Difficulty })
  difficulty: Difficulty;

  @Column({ type: 'enum', enum: Genre })
  genre: Genre;

  @Column({ type: 'simple-json' })
  metadata: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  hints: string[];

  @Column({ type: 'simple-json' })
  solution: Record<string, any>;

  @Column({ default: true })
  isActive: boolean;
}
