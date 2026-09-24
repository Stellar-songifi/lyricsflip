import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorPage from '@/app/error';
import NotFoundPage from '@/app/not-found';
import GlobalErrorPage from '@/app/global-error';
import AppNotConfigured from '@/components/atoms/app-not-configured';
import { getMissingRequiredEnv } from '@/lib/requiredEnv';

describe('route error boundaries', () => {
  it('error page shows the message with a working retry', () => {
    const reset = jest.fn();
    const { container } = render(
      <ErrorPage error={new Error('Boom')} reset={reset} />
    );
    expect(container.textContent).toContain('Boom');
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('404 page links back to the game', () => {
    const { container } = render(<NotFoundPage />);
    expect(container.textContent).toContain('404');
    const link = screen.getByRole('link', { name: /back to game/i });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('global error page renders standalone with retry', () => {
    const reset = jest.fn();
    const { container } = render(
      <GlobalErrorPage error={new Error('Crash')} reset={reset} />
    );
    expect(container.textContent).toContain('Crash');
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('unconfigured screen lists the missing vars', () => {
    const { container } = render(
      <AppNotConfigured missing={['NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID']} />
    );
    expect(container.textContent).toContain('App is not configured');
    expect(container.textContent).toContain(
      'NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID'
    );
  });

  it('detects missing contract ids', () => {
    delete process.env.NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID;
    expect(getMissingRequiredEnv()).toEqual([
      'NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID',
      'NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID',
    ]);
  });
});
