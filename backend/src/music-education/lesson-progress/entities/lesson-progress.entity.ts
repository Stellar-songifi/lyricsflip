import { MusicLesson } from '../../music-lessons/entities/music-theory-lesson.entity';
import { User } from '../../../user/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

@Entity('lesson_progress')
export class LessonProgress {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true })
  user: User;

  @ManyToOne(() => MusicLesson, { eager: true })
  lesson: MusicLesson;

  @Column({ default: false })
  completed: boolean;
}
