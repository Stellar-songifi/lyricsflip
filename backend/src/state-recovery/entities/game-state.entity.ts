import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class GameState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  gameId: string;

  @Column()
  playerId: string;

  @Column('json')
  state: any;

  @Column()
  version: number;

  @Column()
  checksum: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: true })
  isValid: boolean;
}
