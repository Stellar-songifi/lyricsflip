import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../user.entity';
import { Notification } from '../../notification/entities/notification.entity';
import { PasswordResetToken } from '../../auth/entities/password-reset-token.entity';
import { ExportAccountDto } from '../dtos/export-account.dto';

/**
 * On-chain data (game results, scores, wagers) lives on the Stellar blockchain
 * and is publicly accessible. It cannot be modified or erased.
 */
const ONCHAIN_PRIVACY_NOTE =
  'Your game results, scores, and wager transactions are recorded on the ' +
  'Stellar blockchain. Because blockchain data is public and immutable, ' +
  'these records cannot be modified or deleted, even after account deletion.';

const OFFCHAIN_PRIVACY_NOTE =
  'Your email address, username, password hash, notifications, and password ' +
  'reset tokens are stored in our off-chain database and will be permanently ' +
  'removed (or anonymised) when you delete your account.';

@Injectable()
export class AccountDataProvider {
  private readonly logger = new Logger(AccountDataProvider.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
  ) {}

  /**
   * Returns a JSON snapshot of all off-chain personal data held for the user:
   * profile fields, notifications, and a privacy note explaining what is
   * on-chain and therefore cannot be erased.
   */
  async exportAccountData(userId: string): Promise<ExportAccountDto> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const notifications = await this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return {
      profile: {
        id: user.id,
        username: user.username,
        email: user.email ?? null,
        firstname: user.firstname ?? null,
        lastname: user.lastname ?? null,
        avatar: user.avatar ?? null,
        tokens: user.tokens,
        totalScore: user.totalScore,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        points: user.points,
        createdAt: user.createdAt,
      },
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        metadata: n.metadata,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
      privacyNote: {
        offChain: OFFCHAIN_PRIVACY_NOTE,
        onChain: ONCHAIN_PRIVACY_NOTE,
      },
    };
  }

  /**
   * Anonymises the user's account and deletes all off-chain personal data:
   *
   * 1. Overwrites personal fields on the `users` row (email, password,
   *    firstname, lastname, avatar, referralCode) with nulls / empty values,
   *    and replaces the username with a non-identifying token so the row can
   *    remain as a foreign-key anchor for game-history records.
   * 2. Hard-deletes all `notifications` rows for the user.
   * 3. Hard-deletes all `password_reset_tokens` rows for the user.
   *
   * On-chain data (game results, scores, wagers on the Stellar network) is
   * public and immutable — it is not touched here.
   */
  async deleteAccountData(userId: string): Promise<{ message: string; privacyNote: string }> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Step 1 — anonymise the users row in a single update
    const anonymisedUsername = `deleted_${randomUUID()}`;
    await this.userRepository.update(userId, {
      username: anonymisedUsername,
      email: null,
      password: null,
      firstname: null,
      lastname: null,
      avatar: null,
      referralCode: null,
      // stellarAddress is kept: it is the wallet's public key and is already
      // on-chain, so there is no privacy benefit from removing it here, and
      // removing it would break any on-chain lookup.
    });

    this.logger.log(`User ${userId} anonymised as ${anonymisedUsername}`);

    // Step 2 — delete notifications
    await this.notificationRepository.delete({ userId });

    // Step 3 — delete password reset tokens
    await this.passwordResetTokenRepository.delete({ userId });

    this.logger.log(`Off-chain personal data deleted for user ${userId}`);

    return {
      message:
        'Your account has been anonymised and all off-chain personal data ' +
        '(email, username, notifications, password reset tokens) has been ' +
        'permanently deleted.',
      privacyNote: ONCHAIN_PRIVACY_NOTE,
    };
  }
}
