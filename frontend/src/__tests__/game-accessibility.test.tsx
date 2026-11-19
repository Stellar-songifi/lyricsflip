// frontend/src/__tests__/game-accessibility.test.tsx
//
// Accessibility coverage for the game UI (LF-311, issue #897):
// - SongOptions: radiogroup semantics, number keys, focus rings, aria-live
//   announcements.
// - LyricCard: 3D flip and reduced-motion crossfade.
// - StatisticsPanel: announcements of the remaining time at 10 s and 5 s.
// - Confetti: skipped under `prefers-reduced-motion: reduce`.
import { axe } from 'jest-axe';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LyricCard } from '@/components/organisms/LyricCard';
import { SongOptions } from '@/components/molecules/song-options';
import { StatisticsPanel } from '@/components/molecules/statistics-panel';
import { Confetti } from '@/components/molecules/confetti';
import { useStore } from '@/store';

// `StatisticsPanel` pulls in `GameResultPopup`, which imports the Stellar
// chain. Jest resolves modules only inside the frontend rootDir, so the
// config module is out of reach; mock the hook instead (as the existing
// integration tests do).
jest.mock('@/lib/stellar/hooks/useStellar', () => ({
  useStellar: () => ({
    setup: null,
    systemCalls: null,
    account: null,
    isLoading: false,
    error: null,
    warnings: [],
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

const LYRIC = { text: 'A lyric snippet', title: 'A Song', artist: 'An Artist' };

/**
 * Asserts axe reports no serious violations, as LF-311 requires
 * ("axe reports no serious violations").
 */
const expectNoSeriousViolations = async (container: HTMLElement) => {
  const { violations } = await axe(container);
  expect(
    violations.filter((violation) => ['serious', 'critical'].includes(violation.impact)),
  ).toEqual([]);
};

/** Runs `fn` with `prefers-reduced-motion: reduce` mocked as active. */
function withReducedMotion(fn: () => void) {
  const original = window.matchMedia;
  const matchMediaMock = jest.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
  window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;
  try {
    fn();
  } finally {
    window.matchMedia = original;
  }
}

describe('game accessibility (LF-311)', () => {
  beforeEach(() => {
    useStore.getState().game.resetGame();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('SongOptions', () => {
    const options = [
      { title: 'Song One', artist: 'Artist One' },
      { title: 'Song Two', artist: 'Artist Two' },
      { title: 'Song Three', artist: 'Artist Three' },
      { title: 'Song Four', artist: 'Artist Four' },
    ];

    it('renders a radiogroup whose options are focusable radios with focus rings', () => {
      render(<SongOptions options={options} onSelect={jest.fn()} />);
      const group = screen.getByRole('radiogroup', { name: 'Answer options' });
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(4);
      radios.forEach((radio) => {
        expect(radio).toHaveAttribute('aria-checked', 'false');
        expect(radio.className).toContain('focus-visible:ring-2');
      });
      expect(group).toContainElement(radios[0] as HTMLElement);
    });

    it('selects an option with a number key', () => {
      const onSelect = jest.fn();
      render(<SongOptions options={options} onSelect={onSelect} />);
      fireEvent.keyDown(screen.getAllByRole('radio')[2], { key: '3' });
      expect(onSelect).toHaveBeenCalledWith(options[2], 2);
    });

    it('moves focus between options with the arrow keys', () => {
      render(<SongOptions options={options} onSelect={jest.fn()} />);
      const radios = screen.getAllByRole('radio');
      fireEvent.keyDown(radios[0], { key: 'ArrowDown' });
      expect(document.activeElement).toBe(radios[1]);
      fireEvent.keyDown(radios[1], { key: 'ArrowDown' });
      expect(document.activeElement).toBe(radios[2]);
    });

    it('announces the selection through an aria-live region', () => {
      render(
        <SongOptions
          options={options}
          onSelect={jest.fn()}
          selectedOption={options[0]}
          resultAnnouncement="Correct!"
        />,
      );
      expect(screen.getByTestId('song-options-result')).toHaveTextContent('Correct!');
    });

    it('reports no serious violations with axe', async () => {
      const { container } = render(<SongOptions options={options} onSelect={jest.fn()} />);
      await expectNoSeriousViolations(container);
    });
  });

  describe('LyricCard', () => {
    it('flips the card and exposes the lyric to screen readers', () => {
      render(<LyricCard lyrics={[LYRIC]} isFlipped={false} />);
      expect(screen.getByTestId('lyric-card')).toBeInTheDocument();
      // Both faces render the lyric; the back face is `aria-hidden`.
      expect(screen.getAllByText(LYRIC.text)).toHaveLength(2);
    });

    it('uses a crossfade instead of the 3D flip under prefers-reduced-motion', () => {
      withReducedMotion(() => {
        const { container } = render(<LyricCard lyrics={[LYRIC]} isFlipped />);
        // The 3D-flip wrapper is absent; the two faces crossfade.
        expect(screen.queryByTestId('lyric-card')).toBeNull();
        // The two CardFace roots carry the inline opacity; inner wrappers
        // also have `absolute inset-0` classes but no opacity style.
        const faces = Array.from(
          container.querySelectorAll('div.absolute.inset-0'),
        ).filter((el) => (el as HTMLElement).style.opacity !== '');
        expect(faces).toHaveLength(2);
        expect((faces[0] as HTMLElement).style.opacity).toBe('0');
        expect((faces[1] as HTMLElement).style.opacity).toBe('1');
        // The decorative back face is hidden from assistive tech.
        expect(faces[1].getAttribute('aria-hidden')).toBe('true');
      });
    });

    it('reports no serious violations with axe', async () => {
      const { container } = render(<LyricCard lyrics={[LYRIC]} isFlipped={false} />);
      await expectNoSeriousViolations(container);
    });
  });

  describe('StatisticsPanel', () => {
    it('announces the time left at 10 s and 5 s through a live region', () => {
      jest.useFakeTimers();
      render(<StatisticsPanel time="20" potWin="10 STRK" scores="0/5" />);
      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(screen.getByTestId('timer-announcement')).toHaveTextContent('10 seconds left');
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('timer-announcement')).toHaveTextContent('5 seconds left');
    });

    it('reports no serious violations with axe', async () => {
      const { container } = render(<StatisticsPanel time="20" potWin="10 STRK" scores="0/5" />);
      await expectNoSeriousViolations(container);
    });
  });

  describe('Confetti', () => {
    it('renders confetti pieces by default', () => {
      render(<Confetti />);
      expect(screen.getByTestId('confetti')).toBeInTheDocument();
    });

    it('renders nothing under prefers-reduced-motion', () => {
      withReducedMotion(() => {
        const { container } = render(<Confetti />);
        expect(container.firstChild).toBeNull();
      });
    });
  });
});
