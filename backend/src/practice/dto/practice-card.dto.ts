import { ApiProperty } from '@nestjs/swagger';

/** A single practice card as returned by GET /practice. */
export class PracticeCardDto {
  @ApiProperty({ description: 'Unique song id (UUID)' })
  id: string;

  @ApiProperty({ description: 'Lyric snippet to display' })
  lyrics: string;

  @ApiProperty({ description: 'Correct song title (revealed after answer)' })
  title: string;

  @ApiProperty({ description: 'Artist name (revealed after answer)' })
  artist: string;

  @ApiProperty({ description: 'Release year (revealed after answer)' })
  year: number;

  @ApiProperty({ description: 'Song genre' })
  genre: string;

  /**
   * Four shuffled answer options (titles) — one is correct.
   * Computed by the service from the available song catalogue.
   */
  @ApiProperty({
    type: [String],
    description: 'Four shuffled title options; one of them is the correct answer',
  })
  options: string[];
}

export class PracticeRoundDto {
  @ApiProperty({ type: [PracticeCardDto] })
  cards: PracticeCardDto[];

  @ApiProperty({ description: 'Total number of cards in this practice round' })
  total: number;
}
