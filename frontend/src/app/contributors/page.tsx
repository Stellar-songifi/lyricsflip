import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

interface Contributor {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

const CONTRIBUTORS_URL =
  'https://api.github.com/repos/Stellar-songifi/lyricsflip/contributors?per_page=100';

export const metadata: Metadata = {
  title: 'Contributors · LyricsFlip',
  description: 'Meet the people who build and maintain LyricsFlip.',
};

/** Fetches contributors, revalidated daily. Returns [] when offline or rate-limited. */
async function getContributors(): Promise<Contributor[]> {
  try {
    const res = await fetch(CONTRIBUTORS_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Contributor[];
    return Array.isArray(data) ? data.filter((c) => c?.login) : [];
  } catch {
    return [];
  }
}

export default async function ContributorsPage() {
  const [t, contributors] = await Promise.all([
    getTranslations('contributors'),
    getContributors(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-3 text-base text-gray-600">{t('subtitle')}</p>
      </header>

      {contributors.length === 0 ? (
        <p className="text-center text-gray-500">{t('empty')}</p>
      ) : (
        <ul
          role="list"
          className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        >
          {contributors.map((c) => (
            <li key={c.id} className="flex flex-col items-center text-center">
              <a
                href={c.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col items-center"
              >
                <Image
                  src={c.avatar_url}
                  alt={t('avatarAlt', { login: c.login })}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-full ring-2 ring-transparent transition group-hover:ring-blue-500"
                  unoptimized
                />
                <span className="mt-3 font-medium text-gray-900 group-hover:text-blue-600">
                  {c.login}
                </span>
                <span className="text-sm text-gray-500">
                  {t('contributions', { count: c.contributions })}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
