import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UserService } from '../../user/providers/user.service';
import { HashingProvider } from './hashing-provider';
import { MailService } from '../../mail/mail.service';
import { PasswordResetToken } from '../entities/password-reset-token.entity';

export const RESET_TOKEN_TTL_MINUTES = parseInt(process.env.PASSWORD_RESET_TTL_MINUTES ?? '15', 10);
/** At most this many reset emails per account per window. */
export const RESET_REQUESTS_PER_WINDOW = 3;
export const RESET_REQUEST_WINDOW_MINUTES = 60;

export const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class PasswordResetProvider {
  private readonly logger = new Logger(PasswordResetProvider.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepository: Repository<PasswordResetToken>,
    private readonly userService: UserService,
    private readonly hashingProvider: HashingProvider,
    private readonly mailService: MailService,
  ) {}

  /**
   * Emails a reset link if the account exists. Always resolves the same way
   * so the endpoint can't be used to discover which emails are registered.
   */
  async requestReset(email: string): Promise<void> {
    const user = await this.userService.findUserByEmail(email);
    if (!user) return;

    const windowStart = new Date(Date.now() - RESET_REQUEST_WINDOW_MINUTES * 60_000);
    const recent = await this.tokenRepository.count({
      where: { userId: user.id, createdAt: MoreThan(windowStart) },
    });
    if (recent >= RESET_REQUESTS_PER_WINDOW) {
      this.logger.warn(`Password reset rate limit hit for user ${user.id}`);
      return;
    }

    const token = randomBytes(32).toString('base64url');
    await this.tokenRepository.save(
      this.tokenRepository.create({
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
        usedAt: null,
      }),
    );

    const resetUrl = `${this.mailService.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mailService.send(email, 'passwordReset', {
      resetUrl,
      ttlMinutes: RESET_TOKEN_TTL_MINUTES,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const invalid = new BadRequestException('Invalid or expired reset token');
    const record = await this.tokenRepository.findOne({
      where: { tokenHash: hashResetToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) throw invalid;

    // Claim the token atomically so two concurrent requests can't both use it.
    const claimed = await this.tokenRepository.update(
      { id: record.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    if (claimed.affected !== 1) throw invalid;

    const hashedPassword = await this.hashingProvider.hashPassword(newPassword);
    await this.userService.updateUserPassword(record.userId, hashedPassword);

    // Any other outstanding links for this account stop working too.
    await this.tokenRepository.update(
      { userId: record.userId, usedAt: IsNull() },
      { usedAt: new Date() },
    );
  }
}
