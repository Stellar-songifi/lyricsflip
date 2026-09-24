'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            display: 'flex',
            minHeight: '100vh',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0F0518',
            padding: 16,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 448,
              borderRadius: 12,
              border: '1px solid #2A1538',
              background: '#1A0B24',
              padding: 32,
              textAlign: 'center',
              color: '#fff',
            }}
          >
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>
              LyricsFlip crashed
            </h1>
            <p style={{ marginTop: 8, fontSize: 14, color: '#9ca3af' }}>
              {error.message || 'A critical error stopped the app from starting.'}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 24,
                width: '100%',
                height: 44,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: '#7c3aed',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
