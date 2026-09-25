// src/store/entities/transaction.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../user/user.entity';
import { StoreItem } from './store-item.entity';

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @ManyToOne(() => StoreItem)
  item: StoreItem;

  @Column()
  amount: number;

  @Column()
  currency: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: 'COMPLETED' })
  status: string;
}
