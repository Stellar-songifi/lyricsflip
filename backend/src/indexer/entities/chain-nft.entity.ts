import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('chain_nfts')
export class ChainNft {
  @PrimaryColumn()
  id: string;

  @Column()
  tokenId: string;

  @Column()
  ownerAddress: string;

  @Column({ nullable: true })
  contractAddress: string;

  @Column({ nullable: true })
  mintedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
