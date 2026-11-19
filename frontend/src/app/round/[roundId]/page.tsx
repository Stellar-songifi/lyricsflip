"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ShareButton } from "@/components/molecules/share-button";

type RoundResult = {
  roundId: string;
  player: string;
  score: number;
  genre: string;
  rank: number;
  totalPlayers: number;
};

type FetchState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ready"; data: RoundResult };

const INDEXER_BASE_URL =
  process.env.NEXT_PUBLIC_INDEXER_URL ?? "";

async function fetchRoundResult(roundId: string): Promise<RoundResult | null> {
  if (!INDEXER_BASE_URL) {
    return null;
  }

  const response = await fetch(
    `${INDEXER_BASE_URL.replace(/\/$/, "")}/rounds/${encodeURIComponent(roundId)}`,
    { headers: { Accept: "application/json" } },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to load round (status ${response.status})`);
  }

  const payload = await response.json();

  return {
    roundId: String(payload.roundId ?? roundId),
    player: String(payload.player ?? payload.address ?? ""),
    score: Number(payload.score ?? 0),
    genre: String(payload.genre ?? "Unknown"),
    rank: Number(payload.rank ?? 0),
    totalPlayers: Number(payload.totalPlayers ?? 0),
  };
}

function shortenAddress(address: string): string {
  if (!address) return "Anonymous player";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function RoundResultsPage() {
  const params = useParams<{ roundId: string }>();
  const roundId = params?.roundId ?? "";
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    if (!roundId) {
      setState({ status: "not-found" });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await fetchRoundResult(roundId);
        if (cancelled) return;
        if (!result) {
          setState({ status: "not-found" });
        } else {
          setState({ status: "ready", data: result });
        }
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Something went wrong",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roundId]);

  if (state.status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 py-12">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"
          role="status"
          aria-label="Loading round results"
        />
        <p className="text-sm text-gray-500">Loading round results…</p>
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Round not found</h1>
        <p className="text-sm text-gray-500">
          We couldn&apos;t find results for this round. It may not have finished
          yet or the link may be incorrect.
        </p>
        <Link
          href="/"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Back to home
        </Link>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          Unable to load round
        </h1>
        <p className="text-sm text-gray-500">{state.message}</p>
        <Link
          href="/"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Back to home
        </Link>
      </main>
    );
  }

  const { data } = state;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center gap-6 px-4 py-12">
      <div className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Round Results
          </span>
          <h1 className="text-3xl font-bold text-gray-900">
            {data.score.toLocaleString()} pts
          </h1>
          <p className="text-sm text-gray-500">
            Played by {shortenAddress(data.player)}
          </p>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-gray-50 p-4 text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Genre
            </dt>
            <dd className="mt-1 text-lg font-semibold text-gray-900">
              {data.genre}
            </dd>
          </div>
          <div className="rounded-xl bg-gray-50 p-4 text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Rank
            </dt>
            <dd className="mt-1 text-lg font-semibold text-gray-900">
              {data.rank > 0 ? `#${data.rank}` : "—"}
              {data.totalPlayers > 0 && (
                <span className="ml-1 text-sm font-normal text-gray-500">
                  / {data.totalPlayers}
                </span>
              )}
            </dd>
          </div>
        </dl>

        <p className="mt-6 break-all text-center text-xs text-gray-400">
          Round ID: {data.roundId}
        </p>
      </div>

      <ShareButton
        title="Check out my LyricsFlip round!"
        text={`I scored ${data.score.toLocaleString()} points in ${data.genre} and ranked ${
          data.rank > 0 ? `#${data.rank}` : "—"
        } on LyricsFlip!`}
        url={typeof window !== "undefined" ? window.location.href : ""}
      />

      <Link
        href="/"
        className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        Play a round
      </Link>
    </main>
  );
}