// src/store/entities/inventory.entity.ts
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