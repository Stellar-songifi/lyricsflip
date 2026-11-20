/**
 * Tests for src/lib/stellar/types.ts
 * Covers: genreToWire / genreFromWire round-trips, Answer helpers,
 *         questionKindToWire / questionKindFromWire, and error paths.
 */
import {
  GENRE_VALUES,
  genreToWire,
  genreFromWire,
  QUESTION_KIND_VALUES,
  questionKindToWire,
  questionKindFromWire,
  Answer,
  ROLE_ADMIN,
  type Genre,
} from '@/lib/stellar/types';

// ---------------------------------------------------------------------------
// Genre round-trips
// ---------------------------------------------------------------------------
describe('genreToWire', () => {
  it('returns the correct wire index for every genre', () => {
    GENRE_VALUES.forEach((genre, index) => {
      expect(genreToWire(genre)).toBe(index);
    });
  });

  it('covers all 13 genres', () => {
    expect(GENRE_VALUES).toHaveLength(13);
  });

  it('maps HipHop → 0', () => expect(genreToWire('HipHop')).toBe(0));
  it('maps Pop → 1', () => expect(genreToWire('Pop')).toBe(1));
  it('maps Rock → 2', () => expect(genreToWire('Rock')).toBe(2));
  it('maps RnB → 3', () => expect(genreToWire('RnB')).toBe(3));
  it('maps Electronic → 4', () => expect(genreToWire('Electronic')).toBe(4));
  it('maps Classical → 5', () => expect(genreToWire('Classical')).toBe(5));
  it('maps Jazz → 6', () => expect(genreToWire('Jazz')).toBe(6));
  it('maps Country → 7', () => expect(genreToWire('Country')).toBe(7));
  it('maps Blues → 8', () => expect(genreToWire('Blues')).toBe(8));
  it('maps Reggae → 9', () => expect(genreToWire('Reggae')).toBe(9));
  it('maps Afrobeat → 10', () => expect(genreToWire('Afrobeat')).toBe(10));
  it('maps Gospel → 11', () => expect(genreToWire('Gospel')).toBe(11));
  it('maps Folk → 12', () => expect(genreToWire('Folk')).toBe(12));
});

describe('genreFromWire', () => {
  it('returns the correct Genre for every wire index', () => {
    GENRE_VALUES.forEach((genre, index) => {
      expect(genreFromWire(index)).toBe(genre);
    });
  });

  it('throws for an unknown discriminant (13)', () => {
    expect(() => genreFromWire(13)).toThrow('Unknown Genre discriminant: 13');
  });

  it('throws for a negative discriminant', () => {
    expect(() => genreFromWire(-1)).toThrow();
  });

  it('throws for a very large discriminant', () => {
    expect(() => genreFromWire(999)).toThrow();
  });
});

describe('genreToWire / genreFromWire round-trip', () => {
  it('round-trips every genre', () => {
    GENRE_VALUES.forEach((genre) => {
      expect(genreFromWire(genreToWire(genre))).toBe(genre);
    });
  });
});

// ---------------------------------------------------------------------------
// QuestionKind round-trips
// ---------------------------------------------------------------------------
describe('questionKindToWire', () => {
  it('maps Title → 0', () => expect(questionKindToWire('Title')).toBe(0));
  it('maps Artist → 1', () => expect(questionKindToWire('Artist')).toBe(1));
  it('maps Year → 2', () => expect(questionKindToWire('Year')).toBe(2));
});

describe('questionKindFromWire', () => {
  it('maps 0 → Title', () => expect(questionKindFromWire(0)).toBe('Title'));
  it('maps 1 → Artist', () => expect(questionKindFromWire(1)).toBe('Artist'));
  it('maps 2 → Year', () => expect(questionKindFromWire(2)).toBe('Year'));

  it('throws for an unknown discriminant (3)', () => {
    expect(() => questionKindFromWire(3)).toThrow('Unknown QuestionKind discriminant: 3');
  });
});

describe('questionKindToWire / questionKindFromWire round-trip', () => {
  it('round-trips every QuestionKind', () => {
    QUESTION_KIND_VALUES.forEach((kind) => {
      expect(questionKindFromWire(questionKindToWire(kind))).toBe(kind);
    });
  });
});

// ---------------------------------------------------------------------------
// Answer helpers
// ---------------------------------------------------------------------------
describe('Answer helpers', () => {
  it('Answer.title creates a Title answer', () => {
    const answer = Answer.title('Bohemian Rhapsody');
    expect(answer.tag).toBe('Title');
    expect(answer.values).toEqual(['Bohemian Rhapsody']);
  });

  it('Answer.artist creates an Artist answer', () => {
    const answer = Answer.artist('Queen');
    expect(answer.tag).toBe('Artist');
    expect(answer.values).toEqual(['Queen']);
  });

  it('Answer.year creates a Year answer with a bigint from a number', () => {
    const answer = Answer.year(1975);
    expect(answer.tag).toBe('Year');
    expect(answer.values).toEqual([BigInt(1975)]);
  });

  it('Answer.year accepts a bigint directly', () => {
    const answer = Answer.year(BigInt(2024));
    expect(answer.tag).toBe('Year');
    expect(answer.values).toEqual([BigInt(2024)]);
  });

  it('Answer.year always stores a bigint even when given a number', () => {
    const answer = Answer.year(2000);
    expect(typeof answer.values[0]).toBe('bigint');
  });
});

// ---------------------------------------------------------------------------
// ROLE_ADMIN constant
// ---------------------------------------------------------------------------
describe('ROLE_ADMIN', () => {
  it('is 0', () => {
    expect(ROLE_ADMIN).toBe(0);
  });
});
