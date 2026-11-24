import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Song, SongStatus, UNPUBLISHED_STATUSES } from './entities/song.entity';
import { Tag } from './entities/tag.entity';
import { SubmitSongDto } from './dto/submit-song.dto';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';
import { QuerySongsDto } from './dto/query-songs.dto';
import { Genre } from './enums/genre.enum';
import { isAllowedLicense } from './constants/allowed-licenses';

export interface PaginatedSongs {
  data: Song[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class SongsService {
  constructor(
    @InjectRepository(Song)
    private readonly songRepository: Repository<Song>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
  ) {}

  // ── Submission ─────────────────────────────────────────────────────────────

  /**
   * Public song submission — creates the card in SUBMITTED status.
   * Validates the license against the content policy allow-list before saving.
   */
  async submit(dto: SubmitSongDto): Promise<Song> {
    this.assertLicenseAllowed(dto.license);
    const { tags, ...fields } = dto;
    const song = this.songRepository.create({
      ...fields,
      status: SongStatus.SUBMITTED,
      reviewerId: null,
      rejectionReason: null,
      tags: await this.resolveTags(tags),
    });
    return this.songRepository.save(song);
  }

  /**
   * Admin song creation — also validates license, starts in SUBMITTED status
   * so it flows through the same review pipeline.
   */
  async create(dto: CreateSongDto): Promise<Song> {
    this.assertLicenseAllowed(dto.license);
    const { tags, ...fields } = dto;
    const song = this.songRepository.create({
      ...fields,
      status: SongStatus.SUBMITTED,
      reviewerId: null,
      rejectionReason: null,
      tags: await this.resolveTags(tags),
    });
    return this.songRepository.save(song);
  }

  // ── Review workflow ────────────────────────────────────────────────────────

  /**
   * Admin picks up a submitted (or draft) card for review.
   * SUBMITTED | DRAFT → IN_REVIEW
   */
  async startReview(id: string, reviewerId: string): Promise<Song> {
    const song = await this.findOne(id);
    const allowedFrom: SongStatus[] = [SongStatus.SUBMITTED, SongStatus.DRAFT];
    if (!allowedFrom.includes(song.status)) {
      throw new BadRequestException(
        `Cannot start review: song is '${song.status}', expected one of: ${allowedFrom.join(', ')}.`,
      );
    }
    song.status = SongStatus.IN_REVIEW;
    song.reviewerId = reviewerId;
    song.rejectionReason = null;
    return this.songRepository.save(song);
  }

  /**
   * Admin approves a card after review.
   * IN_REVIEW → APPROVED  (also accepts SUBMITTED/DRAFT for direct approval)
   */
  async approveSong(id: string, reviewerId: string): Promise<Song> {
    const song = await this.findOne(id);
    const allowedFrom: SongStatus[] = [
      SongStatus.IN_REVIEW,
      SongStatus.SUBMITTED,
      SongStatus.DRAFT,
    ];
    if (!allowedFrom.includes(song.status)) {
      throw new BadRequestException(
        `Cannot approve: song is '${song.status}', expected one of: ${allowedFrom.join(', ')}.`,
      );
    }
    // Re-validate license at approval time — it may have been updated since
    // submission.
    this.assertLicenseAllowed(song.license);
    song.status = SongStatus.APPROVED;
    song.reviewerId = reviewerId;
    song.rejectionReason = null;
    return this.songRepository.save(song);
  }

  /**
   * Admin rejects a card with a mandatory reason.
   * IN_REVIEW | SUBMITTED | DRAFT → REJECTED
   */
  async rejectSong(
    id: string,
    reviewerId: string,
    reason: string,
  ): Promise<Song> {
    const song = await this.findOne(id);
    const allowedFrom: SongStatus[] = [
      SongStatus.IN_REVIEW,
      SongStatus.SUBMITTED,
      SongStatus.DRAFT,
    ];
    if (!allowedFrom.includes(song.status)) {
      throw new BadRequestException(
        `Cannot reject: song is '${song.status}', expected one of: ${allowedFrom.join(', ')}.`,
      );
    }
    song.status = SongStatus.REJECTED;
    song.reviewerId = reviewerId;
    song.rejectionReason = reason;
    return this.songRepository.save(song);
  }

  /**
   * Records the on-chain card_id returned by an add_cards transaction and
   * flips the song to ON_CHAIN.  Called by the admin UI after it signs and
   * submits the XDR produced by SongSyncService.buildPublishBatches().
   */
  async markPublished(id: string, onChainCardId: string): Promise<Song> {
    const song = await this.findOne(id);
    if (song.status !== SongStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot mark as published: song is '${song.status}', expected 'approved'.`,
      );
    }
    song.status = SongStatus.ON_CHAIN;
    song.onChainCardId = onChainCardId;
    return this.songRepository.save(song);
  }

  /**
   * @deprecated Use approveSong() — kept so existing callers (e.g. older
   * admin tooling) still compile.  Delegates to approveSong with a sentinel
   * reviewerId.
   */
  async approve(id: string): Promise<Song> {
    return this.approveSong(id, 'system');
  }

  /** Records the id the contract returned for a synced song. @deprecated Use markPublished(). */
  async markSynced(id: string, onChainCardId: string): Promise<Song> {
    return this.markPublished(id, onChainCardId);
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async findAll(query: QuerySongsDto = {}): Promise<PaginatedSongs> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.songRepository
      .createQueryBuilder('song')
      .leftJoinAndSelect('song.tags', 'tag')
      // Hide everything that has not been approved or published.
      .where('song.status NOT IN (:...unpublished)', {
        unpublished: UNPUBLISHED_STATUSES,
      });

    if (query.genre) {
      qb.andWhere('song.genre = :genre', { genre: query.genre });
    }
    if (query.difficulty) {
      qb.andWhere('song.difficulty = :difficulty', {
        difficulty: query.difficulty,
      });
    }
    if (query.q) {
      qb.andWhere('(song.title ILIKE :q OR song.artist ILIKE :q)', {
        q: `%${query.q}%`,
      });
    }
    if (query.tag) {
      qb.andWhere(
        'song.id IN (SELECT st."songsId" FROM song_tags st JOIN tags t ON t.id = st."tagsId" WHERE t.name = :tag)',
        { tag: query.tag },
      );
    }

    qb.orderBy(`song.${query.sortBy ?? 'createdAt'}`, query.sortOrder ?? 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Song> {
    const song = await this.songRepository.findOne({ where: { id } });
    if (!song) {
      throw new NotFoundException(`Song with ID ${id} not found`);
    }
    return song;
  }

  async findByOnChainCardId(cardId: string): Promise<Song> {
    const song = await this.songRepository.findOne({
      where: { onChainCardId: cardId },
    });
    if (!song) {
      throw new NotFoundException(`Song for on-chain card ${cardId} not found`);
    }
    return song;
  }

  findByGenre(genre: Genre): Promise<Song[]> {
    return this.songRepository.find({
      where: { genre, status: Not(In(UNPUBLISHED_STATUSES)) },
    });
  }

  /** Every song regardless of status — for admin listings. */
  findAllForAdmin(): Promise<Song[]> {
    return this.songRepository.find();
  }

  findByStatus(status: SongStatus): Promise<Song[]> {
    return this.songRepository.find({ where: { status } });
  }

  async update(id: string, dto: UpdateSongDto): Promise<Song> {
    const song = await this.findOne(id);
    const { tags, ...fields } = dto;
    // If the license is being changed, re-validate it.
    if (fields.license !== undefined) {
      this.assertLicenseAllowed(fields.license);
    }
    Object.assign(song, fields);
    if (tags) {
      song.tags = await this.resolveTags(tags);
    }
    return this.songRepository.save(song);
  }

  async remove(id: string): Promise<void> {
    const song = await this.findOne(id);
    await this.songRepository.remove(song);
  }

  async incrementPlayCount(id: string): Promise<Song> {
    const song = await this.findOne(id);
    await this.songRepository.increment({ id }, 'playCount', 1);
    song.playCount += 1;
    return song;
  }

  async getRandom(genre?: Genre): Promise<Song> {
    const qb = this.songRepository
      .createQueryBuilder('song')
      .leftJoinAndSelect('song.tags', 'tag')
      .where('song.status NOT IN (:...unpublished)', {
        unpublished: UNPUBLISHED_STATUSES,
      })
      .orderBy('RANDOM()')
      .take(1);
    if (genre) {
      qb.andWhere('song.genre = :genre', { genre });
    }
    const song = await qb.getOne();
    if (!song) {
      throw new NotFoundException('No songs available');
    }
    return song;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Throws `BadRequestException` if `license` is not permitted by the content
   * policy.  Called at both submission time and again at approval time (the
   * value may have been edited in between).
   */
  private assertLicenseAllowed(license: string): void {
    if (!isAllowedLicense(license)) {
      throw new BadRequestException(
        `License "${license}" is not permitted by the content policy. ` +
          `Use CC0-1.0, CC-PDDC, LicenseRef-PublicDomain, or LicenseRef-<provider>.`,
      );
    }
  }

  /** Finds tags by name, creating any that don't exist yet. */
  private async resolveTags(names?: string[]): Promise<Tag[]> {
    const unique = [
      ...new Set((names ?? []).map((n) => n.trim()).filter(Boolean)),
    ];
    if (unique.length === 0) {
      return [];
    }
    const existing = await this.tagRepository.find({
      where: { name: In(unique) },
    });
    const known = new Set(existing.map((t) => t.name));
    const created = unique
      .filter((name) => !known.has(name))
      .map((name) => this.tagRepository.create({ name }));
    const saved = created.length ? await this.tagRepository.save(created) : [];
    return [...existing, ...saved];
  }
}
