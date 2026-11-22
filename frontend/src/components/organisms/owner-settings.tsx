'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { StrKey } from '@stellar/stellar-sdk';
import {
  type ConfigurationHistoryEntry,
  type OwnerConfiguration,
} from '@/lib/stellar/client';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';

// Mirrors the MIN_* and MAX_* bounds in onchain/contracts/lyricsflip/src/lib.rs.
const MIN_ANSWER_WINDOW_SECONDS = 5;
const MAX_ANSWER_WINDOW_SECONDS = 180;
const MIN_LOBBY_TIMEOUT_SECONDS = 30;
const MAX_LOBBY_TIMEOUT_SECONDS = 86_400;
const MIN_ROUND_DURATION_SECONDS = 10;
const MAX_ROUND_DURATION_SECONDS = 86_400;
const MIN_ROUND_BUFFER_SECONDS = 1;
const MAX_ROUND_BUFFER_SECONDS = 60;
const MIN_MAX_PLAYERS = 2;
const MAX_MAX_PLAYERS = 8;
const MIN_CARDS_PER_ROUND = 1;
const MAX_CARDS_PER_ROUND = 20;

type SettingKey =
  | 'answerWindow'
  | 'lobbyTimeout'
  | 'roundDuration'
  | 'roundBuffer'
  | 'maxPlayers'
  | 'cardsPerRound'
  | 'nftContract';

type Drafts = Record<SettingKey, string>;

const emptyDrafts: Drafts = {
  answerWindow: '',
  lobbyTimeout: '',
  roundDuration: '',
  roundBuffer: '',
  maxPlayers: '',
  cardsPerRound: '',
  nftContract: '',
};

const formatHistoryValue = (value: string): string => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

export interface OwnerSettingsProps {
  isOwner: boolean;
  walletAddress?: string | null;
}

export function OwnerSettings({ isOwner, walletAddress }: OwnerSettingsProps) {
  const { systemCalls } = useStellar();
  const [configuration, setConfiguration] = useState<OwnerConfiguration | null>(
    null,
  );
  const [history, setHistory] = useState<ConfigurationHistoryEntry[]>([]);
  const [drafts, setDrafts] = useState<Drafts>(emptyDrafts);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(
    null,
  );
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refreshConfiguration = useCallback(async () => {
    if (!systemCalls) {
      setConfigurationError('Stellar contract calls are not initialized.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setConfigurationError(null);
    setHistoryError(null);
    const [configurationResult, historyResult] = await Promise.allSettled([
      systemCalls.getOwnerConfiguration(),
      systemCalls.getConfigurationHistory(),
    ]);

    if (configurationResult.status === 'fulfilled') {
      const current = configurationResult.value;
      setConfiguration(current);
      setDrafts({
        answerWindow: String(current.answerWindow),
        lobbyTimeout: String(current.lobbyTimeout),
        roundDuration:
          current.roundDuration === null ? '' : String(current.roundDuration),
        roundBuffer: String(current.roundBuffer),
        maxPlayers: String(current.maxPlayers),
        cardsPerRound: String(current.cardsPerRound),
        nftContract: current.nftContract ?? '',
      });
    } else {
      setConfigurationError(
        configurationResult.reason instanceof Error
          ? configurationResult.reason.message
          : String(configurationResult.reason),
      );
    }

    if (historyResult.status === 'fulfilled') {
      setHistory(historyResult.value);
    } else {
      setHistoryError(
        historyResult.reason instanceof Error
          ? historyResult.reason.message
          : String(historyResult.reason),
      );
    }
    setIsLoading(false);
  }, [systemCalls]);

  useEffect(() => {
    void refreshConfiguration();
  }, [refreshConfiguration]);

  const updateDraft = (key: SettingKey, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }));
  };

  const runChange = async (
    label: string,
    action: () => Promise<void>,
  ): Promise<void> => {
    setBusy(label);
    setFeedback(null);
    setConfigurationError(null);
    try {
      await action();
      setFeedback(`${label} updated.`);
      await refreshConfiguration();
    } catch (error) {
      setConfigurationError(
        `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusy(null);
    }
  };

  const submitNumber = (
    key: Exclude<SettingKey, 'nftContract'>,
    label: string,
    minimum: number,
    maximum: number,
    save: (value: number) => Promise<void>,
    allowDynamic = false,
  ) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (allowDynamic && drafts[key] === '') {
      await runChange(label, () => save(0));
      return;
    }
    const value = Number(drafts[key]);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      setConfigurationError(
        `${label} must be a whole number between ${minimum} and ${maximum}.`,
      );
      return;
    }
    await runChange(label, () => save(value));
  };

  const renderNumberSetting = (
    key: Exclude<SettingKey, 'nftContract'>,
    title: string,
    minimum: number,
    maximum: number,
    save: (value: number) => Promise<void>,
    allowDynamic = false,
  ) => (
    <form
      key={key}
      className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
      onSubmit={submitNumber(key, title, minimum, maximum, save, allowDynamic)}
    >
      <label className="block font-semibold" htmlFor={`owner-${key}`}>
        {title}
      </label>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Allowed range: {minimum}–{maximum}
        {allowDynamic ? ' seconds, or leave blank for dynamic duration' : ''}
      </p>
      <input
        id={`owner-${key}`}
        type="number"
        min={minimum}
        max={maximum}
        step={1}
        value={drafts[key]}
        onChange={(event) => updateDraft(key, event.target.value)}
        className="mt-3 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-600"
        disabled={isLoading || busy !== null}
      />
      <p className="mt-1 text-xs text-gray-500">
        Current: {key === 'roundDuration' && configuration?.roundDuration === null
          ? 'Dynamic'
          : configuration?.[key] ?? '—'}
      </p>
      <button
        type="submit"
        disabled={isLoading || busy !== null || !isOwner || !systemCalls || !configuration}
        className="mt-3 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
      >
        {busy === title ? 'Confirming…' : `Save ${title.toLowerCase()}`}
      </button>
    </form>
  );

  if (!isOwner) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
        Owner-only configuration is unavailable for this wallet.
      </p>
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="owner-settings-heading">
      <header>
        <h2 id="owner-settings-heading" className="text-2xl font-bold">
          Owner settings
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Current on-chain configuration for{' '}
          <code className="break-all">{walletAddress ?? 'connected owner'}</code>
        </p>
      </header>

      {configurationError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {configurationError}
        </p>
      )}
      {feedback && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-green-700">
          {feedback}
        </p>
      )}

      <section
        aria-labelledby="current-configuration-heading"
        className="rounded-xl border border-gray-200 p-5 dark:border-gray-700"
      >
        <h3 id="current-configuration-heading" className="text-lg font-bold">
          Current configuration
        </h3>
        {isLoading && <p className="mt-3 text-sm text-gray-500">Loading getters…</p>}
        {!isLoading && configuration && (
          <>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-sm text-gray-500">Answer window</dt><dd className="font-semibold">{configuration.answerWindow}s</dd></div>
              <div><dt className="text-sm text-gray-500">Lobby timeout</dt><dd className="font-semibold">{configuration.lobbyTimeout}s</dd></div>
              <div><dt className="text-sm text-gray-500">Round duration</dt><dd className="font-semibold">{configuration.roundDuration === null ? 'Dynamic' : `${configuration.roundDuration}s`}</dd></div>
              <div><dt className="text-sm text-gray-500">Buffer per card</dt><dd className="font-semibold">{configuration.roundBuffer}s</dd></div>
              <div><dt className="text-sm text-gray-500">Max players</dt><dd className="font-semibold">{configuration.maxPlayers}</dd></div>
              <div><dt className="text-sm text-gray-500">Cards per round</dt><dd className="font-semibold">{configuration.cardsPerRound}</dd></div>
              <div><dt className="text-sm text-gray-500">Contract status</dt><dd className="font-semibold">{configuration.isPaused ? 'Paused' : 'Active'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-sm text-gray-500">NFT contract</dt><dd className="break-all font-mono text-sm">{configuration.nftContract ?? 'Not configured'}</dd></div>
            </dl>
            <div className="mt-5">
              <h4 className="font-semibold">Admins ({configuration.admins.length})</h4>
              {configuration.admins.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No admin addresses returned.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {configuration.admins.map((admin) => (
                    <li key={admin} className="break-all font-mono text-sm">{admin}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      <div>
        <h3 className="mb-3 text-lg font-bold">Update configuration</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {renderNumberSetting(
            'answerWindow',
            'Answer window (seconds)',
            MIN_ANSWER_WINDOW_SECONDS,
            MAX_ANSWER_WINDOW_SECONDS,
            (value) => systemCalls!.setAnswerWindow(value),
          )}
          {renderNumberSetting(
            'lobbyTimeout',
            'Lobby timeout (seconds)',
            MIN_LOBBY_TIMEOUT_SECONDS,
            MAX_LOBBY_TIMEOUT_SECONDS,
            (value) => systemCalls!.setLobbyTimeout(value),
          )}
          {renderNumberSetting(
            'roundDuration',
            'Round duration (seconds)',
            MIN_ROUND_DURATION_SECONDS,
            MAX_ROUND_DURATION_SECONDS,
            (value) => systemCalls!.setRoundDuration(value || null),
            true,
          )}
          {renderNumberSetting(
            'roundBuffer',
            'Buffer per card (seconds)',
            MIN_ROUND_BUFFER_SECONDS,
            MAX_ROUND_BUFFER_SECONDS,
            (value) => systemCalls!.setRoundBuffer(value),
          )}
          {renderNumberSetting(
            'maxPlayers',
            'Max players',
            MIN_MAX_PLAYERS,
            MAX_MAX_PLAYERS,
            (value) => systemCalls!.setMaxPlayers(value),
          )}
          {renderNumberSetting(
            'cardsPerRound',
            'Cards per round',
            MIN_CARDS_PER_ROUND,
            MAX_CARDS_PER_ROUND,
            (value) => systemCalls!.setCardsPerRound(value),
          )}
          <form
            className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
            onSubmit={(event) => {
              event.preventDefault();
              const address = drafts.nftContract.trim();
              if (!StrKey.isValidContract(address)) {
                setConfigurationError('NFT contract must be a valid C... Stellar contract StrKey.');
                return;
              }
              void runChange('NFT contract', () =>
                systemCalls!.setNftContract(address),
              );
            }}
          >
            <label htmlFor="owner-nftContract" className="block font-semibold">
              NFT contract
            </label>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Must be a valid Stellar contract address (C…).
            </p>
            <input
              id="owner-nftContract"
              type="text"
              value={drafts.nftContract}
              onChange={(event) => updateDraft('nftContract', event.target.value)}
              className="mt-3 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-gray-600"
              spellCheck={false}
              disabled={isLoading || busy !== null || !configuration}
            />
            <p className="mt-1 break-all text-xs text-gray-500">
              Current: {configuration?.nftContract ?? 'Not configured'}
            </p>
            <button
              type="submit"
              disabled={isLoading || busy !== null || !isOwner || !systemCalls || !configuration}
              className="mt-3 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              Save NFT contract
            </button>
          </form>
          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <h4 className="font-semibold">Paused</h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Current state: {configuration?.isPaused ? 'Paused' : 'Active'}
            </p>
            <button
              type="button"
              disabled={isLoading || busy !== null || !configuration || !systemCalls}
              onClick={() =>
                void runChange(
                  configuration?.isPaused ? 'Unpause' : 'Pause',
                  () =>
                    configuration?.isPaused
                      ? systemCalls!.unpause()
                      : systemCalls!.pause(),
                )
              }
              className="mt-3 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {configuration?.isPaused ? 'Unpause contract' : 'Pause contract'}
            </button>
          </div>
        </div>
      </div>

      <section aria-labelledby="configuration-history-heading">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="configuration-history-heading" className="text-lg font-bold">
              Configuration change history
            </h3>
            <p className="text-sm text-gray-500">
              Contract events from the most recent 10,000 ledgers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshConfiguration()}
            disabled={isLoading || busy !== null}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Refresh
          </button>
        </div>
        {historyError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            Could not load configuration history: {historyError}
          </p>
        )}
        {!historyError && history.length === 0 && !isLoading && (
          <p className="mt-3 text-sm text-gray-500">No recent configuration events.</p>
        )}
        <ol className="mt-3 space-y-2">
          {history.map((event, index) => (
            <li
              key={`${event.ledger}-${event.name}-${index}`}
              className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
            >
              <p className="font-semibold capitalize">
                {event.name.replaceAll('_', ' ')} · ledger {event.ledger}
              </p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-xs text-gray-600 dark:text-gray-400">
                {formatHistoryValue(event.value)}
              </pre>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
