import type { GetStaticProps, NextPage } from 'next';
import Head from 'next/head';
import Image from 'next/image';

interface Contributor {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

interface ContributorsPageProps {
  contributors: Contributor[];
}

const ContributorsPage: NextPage<ContributorsPageProps> = ({ contributors }) => {
  return (
    <>
      <Head>
        <title>Contributors · LyricsFlip</title>
        <meta
          name="description"
          content="Meet the people who build and maintain LyricsFlip."
        />
      </Head>

      <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Contributors
          </h1>
          <p className="mt-3 text-base text-gray-600">
            Thanks to everyone who has contributed to LyricsFlip.
          </p>
        </header>

        {contributors.length === 0 ? (
          <p className="text-center text-gray-500">
            No contributors to display yet.
          </p>
        ) : (
          <ul
            role="list"
            className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          >
            {contributors.map((contributor) => (
              <li key={contributor.id} className="flex flex-col items-center text-center">
                <a
                  href={contributor.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col items-center"
                >
                  <Image
                    src={contributor.avatar_url}
                    alt={`${contributor.login}'s avatar`}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-full ring-2 ring-transparent transition group-hover:ring-blue-500"
                    unoptimized
                  />
                  <span className="mt-3 font-medium text-gray-900 group-hover:text-blue-600">
                    {contributor.login}
                  </span>
                  <span className="text-sm text-gray-500">
                    {contributor.contributions}{' '}
                    {contributor.contributions === 1 ? 'contribution' : 'contributions'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
};

export const getStaticProps: GetStaticProps<ContributorsPageProps> = async () => {
  try {
    const res = await fetch(
      'https://api.github.com/repos/lyricsflip/lyricsflip/contributors?per_page=100',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
      }
    );

    if (!res.ok) {
      throw new Error(`GitHub API responded with ${res.status}`);
    }

    const data = (await res.json()) as Contributor[];

    const contributors = data
      .filter((contributor) => contributor && contributor.login)
      .map((contributor) => ({
        id: contributor.id,
        login: contributor.login,
        avatar_url: contributor.avatar_url,
        html_url: contributor.html_url,
        contributions: contributor.contributions,
      }));

    return {
      props: { contributors },
      revalidate: 3600,
    };
  } catch (error) {
    console.error('Failed to fetch contributors:', error);

    return {
      props: { contributors: [] },
      revalidate: 60,
    };
  }
};

export default ContributorsPage;
