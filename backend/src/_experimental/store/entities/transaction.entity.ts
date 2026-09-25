// src/store/entities/transaction.entity.ts
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