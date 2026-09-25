// src/store/entities/inventory.entity.ts
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
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @ManyToOne(() => StoreItem)
  item: StoreItem;

  @Column({ default: 1 })
  quantity: number;

  @CreateDateColumn()
  acquiredAt: Date;
}
