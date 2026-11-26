import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user.entity';

/**
 * LF-341: Validates a candidate username against:
 *  1. A static reserved-word list (impersonation / system names).
 *  2. A lightweight profanity block-list.
 *  3. The database's case-insensitive unique index.
 *
 * Keep this provider focused on validation only; the actual save lives in
 * UserService.setUsername().
 */
@Injectable()
export class UsernameValidatorService {
  /**
   * Names that must not be claimed by regular users.  Add entries here as
   * the platform evolves.  All entries are lowercased; comparisons are made
   * against the lowercased candidate.
   */
  private static readonly RESERVED_WORDS = new Set<string>([
    // Platform / product names
    'admin',
    'administrator',
    'lyricsflip',
    'lyrics_flip',
    'support',
    'moderator',
    'mod',
    'staff',
    'official',
    'system',
    'root',
    'superuser',
    'help',
    'info',
    'contact',
    'security',
    'abuse',
    'billing',
    'api',
    'bot',
    'service',
    'null',
    'undefined',
    'anonymous',
    'guest',
    'test',
    'demo',
    // Stellar / crypto impersonation
    'stellar',
    'xlm',
    'lumens',
    'horizon',
    'freighter',
    // Common impersonation targets
    'satoshi',
    'nakamoto',
    'vitalik',
    'elon',
    'musk',
  ]);

  /**
   * Minimal profanity block-list.  This is intentionally lightweight; for
   * production consider a dedicated library (e.g. `bad-words`) or an
   * external moderation service.
   */
  private static readonly PROFANITY_LIST = new Set<string>([
    'fuck',
    'shit',
    'cunt',
    'nigger',
    'nigga',
    'faggot',
    'retard',
    'bastard',
    'asshole',
    'bitch',
    'whore',
    'slut',
    'cock',
    'pussy',
    'dick',
    'piss',
    'crap',
    'arse',
    'twat',
  ]);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Throws `BadRequestException` if the name is reserved or profane, and
   * `ConflictException` if another account already holds it
   * (case-insensitively).
   *
   * @param candidate  The lowercased username string to validate.
   * @param currentUserId  The id of the user requesting the change; excluded
   *                       from the uniqueness check so they can re-claim their
   *                       own name without a false conflict.
   */
  public async validate(
    candidate: string,
    currentUserId: string,
  ): Promise<void> {
    const lower = candidate.toLowerCase();

    if (UsernameValidatorService.RESERVED_WORDS.has(lower)) {
      throw new BadRequestException(
        `"${candidate}" is a reserved username and cannot be claimed.`,
      );
    }

    if (this.containsProfanity(lower)) {
      throw new BadRequestException(
        `"${candidate}" contains a prohibited word.`,
      );
    }

    // Case-insensitive uniqueness check via the lower(username) functional index.
    const conflict = await this.userRepository
      .createQueryBuilder('u')
      .where('lower(u.username) = :lower', { lower })
      .andWhere('u.id != :id', { id: currentUserId })
      .getOne();

    if (conflict) {
      throw new ConflictException(
        `The username "${candidate}" is already taken.`,
      );
    }
  }

  /**
   * Returns true if the lowercased candidate contains any profane substring.
   * Substring matching catches simple obfuscations like "sh1t" → false
   * positive risk is low for a 3-20 char handle with [a-z0-9_] only.
   */
  private containsProfanity(lower: string): boolean {
    for (const word of UsernameValidatorService.PROFANITY_LIST) {
      if (lower.includes(word)) {
        return true;
      }
    }
    return false;
  }
}
