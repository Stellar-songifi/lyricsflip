import { Exclude } from 'class-transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserRole } from '../common/enums/role.enum';
import { Referral } from '../social/entities/referral.entity';

@Entity('users')
@Index('IDX_users_username_lower', { synchronize: false })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string; // Unique identifier for the user

  // Common Attributes
  // Username is stored as provided but uniqueness is enforced case-insensitively
  // via the functional unique index IDX_users_username_lower (lower(username)).
  @Column({ unique: true })
  username: string; // The username for the player

  @Column({ unique: true, nullable: true })
  email: string; // Player's email for account identification and recovery. Optional: not set for wallet-only accounts (see stellarAddress below).

  @Exclude() // Passwords should not be returned when the user is returned
  @Column({ nullable: true })
  password: string; // Hashed password for security. Optional: not set for wallet-only accounts.

  @Column({ nullable: true })
  avatar: string; // Optional profile picture URL

  @Column({ default: 0 })
  tokens: number; // Amount of in-game tokens the player owns

  // Player Attributes
  @Column({ nullable: true })
  firstname: string;

  @Column({ nullable: true })
  lastname: string;

  @Column({ default: 0 })
  totalScore: number; // Cumulative score across all games played

  @Column({ default: 0 })
  gamesPlayed: number; // Total number of games the user has participated in

  @Column({ default: 0 })
  gamesWon: number; // Number of games the user has won

  // Role Attribute
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole; // Users roles (admin, player or user) refer to UserRole enum

  @CreateDateColumn()
  createdAt: Date; // Timestamp for when the account was created

  @UpdateDateColumn()
  updatedAt: Date; // Timestamp for the last account update

  @Column({ default: 0 })
  points: number;

  // Wallet login (LF-082). Stellar G... public key.
  // This is the primary lookup key for wallet-based profiles (LF-230).
  @Column({ type: 'varchar', length: 56, unique: true, nullable: true })
  stellarAddress: string | null;

  // Referral Attributes
  @Column({ nullable: true })
  referralCode: string;

  @OneToMany(() => Referral, (referral) => referral.referrer)
  referralsGiven: Referral[];

  @OneToMany(() => Referral, (referral) => referral.referee)
  referralsReceived: Referral[];

  @Column({ type: 'jsonb', default: {} })
  referralStats: {
    totalReferrals: number;
    successfulReferrals: number;
    pendingReferrals: number;
    totalRewardsEarned: number;
  };

  /**
   * Helper to find a user by their Stellar wallet address.
   * The repository must be passed in to keep this entity free of DI concerns.
   */
  static findByStellarAddress<T extends User>(
    repository: { findOne: (options: any) => Promise<T | null> },
    stellarAddress: string,
  ): Promise<T | null> {
    if (!stellarAddress) {
      return Promise.resolve(null);
    }
    return repository.findOne({ where: { stellarAddress } });
  }
}