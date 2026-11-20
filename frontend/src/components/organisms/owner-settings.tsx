'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * OwnerSettings
 * ------------------------------------------------------------------
 * Owner-only settings panel for the LyricsFlip contract.
 *
 * Exposes every owner-only contract function through a dedicated form:
 *   - set_max_players
 *   - set_nft_contract
 *   - transfer_ownership
 *   - accept_ownership
 *   - upgrade
 *   - set_fee (LF-149)
 *   - set_treasury (LF-149)
 *   - pause / unpause (LF-174)
 *
 * Each action requires an explicit confirmation step. A pending-ownership
 * banner is shown to the nominated address with an Accept button.
 *
 * The component is intentionally decoupled from any specific wallet /
 * contract client implementation: it accepts callbacks via props so it can
 * be wired into the admin page (see `frontend/src/app/admin/page.tsx`).
 */

export interface OwnerSettingsProps {
  /** Whether the connected wallet is the current contract owner. */
  isOwner: boolean;
  /** Connected wallet address (G...). */
  walletAddress?: string | null;
  /** Current owner address, if known. */
  currentOwner?: string | null;
  /** Address nominated to become the next owner, if any. */
  pendingOwner?: string | null;
  /** Current max players value. */
  currentMaxPlayers?: number | null;
  /** Current NFT contract address. */
  currentNftContract?: string | null;
  /** Current contract version (from `version()`). */
  currentVersion?: string | null;
  /** Current fee (basis points or contract-defined unit). */
  currentFee?: number | null;
  /** Current treasury address. */
  currentTreasury?: string | null;
  /** Current paused state. */
  isPaused?: boolean | null;

  /** Contract callbacks. Each should return a promise resolving on success. */
  onSetMaxPlayers?: (value: number) => Promise<unknown>;
  onSetNftContract?: (address: string) => Promise<unknown>;
  onTransferOwnership?: (address: string) => Promise<unknown>;
  onAcceptOwnership?: () => Promise<unknown>;
  onUpgrade?: (wasmHash: string) => Promise<unknown>;
  onSetFee?: (value: number) => Promise<unknown>;
  onSetTreasury?: (address: string) => Promise<unknown>;
  onPause?: () => Promise<unknown>;
  onUnpause?: () => Promise<unknown>;

  /** Optional refresh hook invoked after a successful action. */
  onRefresh?: () => void | Promise<void>;
}

type ActionKey =
  | 'set_max_players'
  | 'set_nft_contract'
  | 'transfer_ownership'
  | 'accept_ownership'
  | 'upgrade'
  | 'set_fee'
  | 'set_treasury'
  | 'pause'
  | 'unpause';

interface ConfirmationState {
  action: ActionKey;
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<unknown>;
}

const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;
// Soroban contract WASM hashes are 32-byte hex strings (64 hex chars).
const WASM_HASH_REGEX = /^[0-9a-fA-F]{64}$/;

function truncateAddress(address?: string | null): string {
  if (!address) return '—';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function isValidStellarAddress(value: string): boolean {
  return STELLAR_ADDRESS_REGEX.test(value.trim());
}

function isValidWasmHash(value: string): boolean {
  return WASM_HASH_REGEX.test(value.trim());
}

export function OwnerSettings({
  isOwner,
  walletAddress,
  currentOwner,
  pendingOwner,
  currentMaxPlayers,
  currentNftContract,
  currentVersion,
  currentFee,
  currentTreasury,
  isPaused,
  onSetMaxPlayers,
  onSetNftContract,
  onTransferOwnership,
  onAcceptOwnership,
  onUpgrade,
  onSetFee,
  onSetTreasury,
  onPause,
  onUnpause,
  onRefresh,
}: OwnerSettingsProps) {
  const [maxPlayersInput, setMaxPlayersInput] = useState<string>('');
  const [nftContractInput, setNftContractInput] = useState<string>('');
  const [transferInput, setTransferInput] = useState<string>('');
  const [wasmHashInput, setWasmHashInput] = useState<string>('');
  const [feeInput, setFeeInput] = useState<string>('');
  const [treasuryInput, setTreasuryInput] = useState<string>('');

  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sync inputs with current values when they change.
  useEffect(() => {
    if (currentMaxPlayers != null) setMaxPlayersInput(String(currentMaxPlayers));
  }, [currentMaxPlayers]);

  useEffect(() => {
    if (currentNftContract != null) setNftContractInput(currentNftContract);
  }, [currentNftContract]);

  useEffect(() => {
    if (currentFee != null) setFeeInput(String(currentFee));
  }, [currentFee]);

  useEffect(() => {
    if (currentTreasury != null) setTreasuryInput(currentTreasury);
  }, [currentTreasury]);

  const isPendingOwner = useMemo(() => {
    if (!pendingOwner || !walletAddress) return false;
    return pendingOwner.trim() === walletAddress.trim();
  }, [pendingOwner, walletAddress]);

  const resetFeedback = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const requestConfirmation = useCallback((state: ConfirmationState) => {
    resetFeedback();
    setConfirmation(state);
  }, [resetFeedback]);

  const closeConfirmation = useCallback(() => {
    if (isSubmitting) return;
    setConfirmation(null);
  }, [isSubmitting]);

  const handleConfirm = useCallback(async () => {
    if (!confirmation) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await confirmation.run();
      setSuccess(`${confirmation.title} succeeded.`);
      setConfirmation(null);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`${confirmation.title} failed: ${message}`);
      setConfirmation(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [confirmation, onRefresh]);

  // ---- Form submit handlers ------------------------------------------------

  const submitMaxPlayers = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      resetFeedback();
      const parsed = Number(maxPlayersInput);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setError('Max players must be a positive integer.');
        return;
      }
      if (!onSetMaxPlayers) {
        setError('set_max_players is not available.');
        return;
      }
      requestConfirmation({
        action: 'set_max_players',
        title: 'Set max players',
        description: `Change max players from ${currentMaxPlayers ?? '—'} to ${parsed}?`,
        confirmLabel: 'Set max players',
        run: () => onSetMaxPlayers(parsed),
      });
    },
    [maxPlayersInput, currentMaxPlayers, onSetMaxPlayers, requestConfirmation, resetFeedback],
  );

  const submitNftContract = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      resetFeedback();
      const value = nftContractInput.trim();
      if (!isValidStellarAddress(value)) {
        setError('NFT contract must be a valid Stellar contract/account address (G...).');
        return;
      }
      if (!onSetNftContract) {
        setError('set_nft_contract is not available.');
        return;
      }
      requestConfirmation({
        action: 'set_nft_contract',
        title: 'Set NFT contract',
        description: `Change NFT contract from ${truncateAddress(currentNftContract)} to ${truncateAddress(value)}?`,
        confirmLabel: 'Set NFT contract',
        run: () => onSetNftContract(value),
      });
    },
    [nftContractInput, currentNftContract, onSetNftContract, requestConfirmation, resetFeedback],
  );

  const submitTransferOwnership = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      resetFeedback();
      const value = transferInput.trim();
      if (!isValidStellarAddress(value)) {
        setError('New owner must be a valid Stellar address (G...).');
        return;
      }
      if (!onTransferOwnership) {
        setError('transfer_ownership is not available.');
        return;
      }
      requestConfirmation({
        action: 'transfer_ownership',
        title: 'Transfer ownership',
        description: `Nominate ${truncateAddress(value)} as the new owner? They must accept the transfer.`,
        confirmLabel: 'Transfer ownership',
        run: () => onTransferOwnership(value),
      });
    },
    [transferInput, onTransferOwnership, requestConfirmation, resetFeedback],
  );

  const submitAcceptOwnership = useCallback(() => {
    resetFeedback();
    if (!onAcceptOwnership) {
      setError('accept_ownership is not available.');
      return;
    }
    requestConfirmation({
      action: 'accept_ownership',
      title: 'Accept ownership',
      description: 'Accept ownership of the contract? This will make your address the owner.',
      confirmLabel: 'Accept ownership',
      run: () => onAcceptOwnership(),
    });
  }, [onAcceptOwnership, requestConfirmation, resetFeedback]);

  const submitUpgrade = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      resetFeedback();
      const value = wasmHashInput.trim();
      if (!isValidWasmHash(value)) {
        setError('WASM hash must be a 64-character hex string (32 bytes).');
        return;
      }
      if (!onUpgrade) {
        setError('upgrade is not available.');
        return;
      }
      requestConfirmation({
        action: 'upgrade',
        title: 'Upgrade contract',
        description: `Upgrade contract to WASM hash ${truncateAddress(value)}? Current version: ${currentVersion ?? '—'}.`,
        confirmLabel: 'Upgrade',
        run: () => onUpgrade(value),
      });
    },
    [wasmHashInput, currentVersion, onUpgrade, requestConfirmation, resetFeedback],
  );

  const submitFee = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      resetFeedback();
      const parsed = Number(feeInput);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Fee must be a non-negative number.');
        return;
      }
      if (!onSetFee) {
        setError('set_fee is not available.');
        return;
      }
      requestConfirmation({
        action: 'set_fee',
        title: 'Set fee',
        description: `Change fee from ${currentFee ?? '—'} to ${parsed}?`,
        confirmLabel: 'Set fee',
        run: () => onSetFee(parsed),
      });
    },
    [feeInput, currentFee, onSetFee, requestConfirmation, resetFeedback],
  );

  const submitTreasury = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      resetFeedback();
      const value = treasuryInput.trim();
      if (!isValidStellarAddress(value)) {
        setError('Treasury must be a valid Stellar address (G...).');
        return;
      }
      if (!onSetTreasury) {
        setError('set_treasury is not available.');
        return;
      }
      requestConfirmation({
        action: 'set_treasury',
        title: 'Set treasury',
        description: `Change treasury from ${truncateAddress(currentTreasury)} to ${truncateAddress(value)}?`,
        confirmLabel: 'Set treasury',
        run: () => onSetTreasury(value),
      });
    },
    [treasuryInput, currentTreasury, onSetTreasury, requestConfirmation, resetFeedback],
  );

  const submitPauseToggle = useCallback(() => {
    resetFeedback();
    if (isPaused) {
      if (!onUnpause) {
        setError('unpause is not available.');
        return;
      }
      requestConfirmation({
        action: 'unpause',
        title: 'Unpause contract',
        description: 'Resume contract operations?',
        confirmLabel: 'Unpause',
        run: () => onUnpause(),
      });
    } else {
      if (!onPause) {
        setError('pause is not available.');
        return;
      }
      requestConfirmation({
        action: 'pause',
        title: 'Pause contract',
        description: 'Pause all contract operations? This will block user interactions.',
        confirmLabel: 'Pause',
        run: () => onPause(),
      });
    }
  }, [isPaused, onPause, onUnpause, requestConfirmation, resetFeedback]);

  // ---- Render -------------------------------------------------------------

  const showOwnerForms = isOwner;

  return (
    <section className="owner-settings" aria-labelledby="owner-settings-heading">
      <header className="owner-settings__header">
        <h2 id="owner-settings-heading">Owner settings</h2>
        <dl className="owner-settings__meta">
          <div>
            <dt>Owner</dt>
            <dd title={currentOwner ?? undefined}>{truncateAddress(currentOwner)}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{currentVersion ?? '—'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{isPaused == null ? '—' : isPaused ? 'Paused' : 'Active'}</dd>
          </div>
        </dl>
      </header>

      {/* Pending ownership banner — shown to the nominated address. */}
      {isPendingOwner && (
        <div className="owner-settings__banner" role="status" aria-live="polite">
          <div className="owner-settings__banner-text">
            <strong>You have been nominated as the new owner.</strong>
            <span>Accept the transfer to become the contract owner.</span>
          </div>
          <button
            type="button"
            className="owner-settings__button owner-settings__button--primary"
            onClick={submitAcceptOwnership}
            disabled={isSubmitting || !onAcceptOwnership}
          >
            Accept
          </button>
        </div>
      )}

      {/* Pending ownership notice for the current owner. */}
      {isOwner && pendingOwner && !isPendingOwner && (
        <div className="owner-settings__notice" role="status">
          Ownership transfer pending to <code>{truncateAddress(pendingOwner)}</code>.
        </div>
      )}

      {error && (
        <div className="owner-settings__alert owner-settings__alert--error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="owner-settings__alert owner-settings__alert--success" role="status">
          {success}
        </div>
      )}

      {!showOwnerForms && !isPendingOwner && (
        <p className="owner-settings__empty">
          You are not the contract owner. Owner-only settings are hidden.
        </p>
      )}

      {showOwnerForms && (
        <div className="owner-settings__forms">
          {/* set_max_players */}
          <form className="owner-settings__form" onSubmit={submitMaxPlayers}>
            <div className="owner-settings__form-header">
              <h3>Max players</h3>
              <span className="owner-settings__current">
                Current: <strong>{currentMaxPlayers ?? '—'}</strong>
              </span>
            </div>
            <label className="owner-settings__field">
              <span>New max players</span>
              <input
                type="number"
                min={1}
                step={1}
                value={maxPlayersInput}
                onChange={(e) => setMaxPlayersInput(e.target.value)}
                placeholder="e.g. 8"
                disabled={isSubmitting || !onSetMaxPlayers}
              />
            </label>
            <button
              type="submit"
              className="owner-settings__button owner-settings__button--primary"
              disabled={isSubmitting || !onSetMaxPlayers}
            >
              Save max players
            </button>
          </form>

          {/* set_nft_contract */}
          <form className="owner-settings__form" onSubmit={submitNftContract}>
            <div className="owner-settings__form-header">
              <h3>NFT contract</h3>
              <span className="owner-settings__current" title={currentNftContract ?? undefined}>
                Current: <strong>{truncateAddress(currentNftContract)}</strong>
              </span>
            </div>
            <label className="owner-settings__field">
              <span>New NFT contract address</span>
              <input
                type="text"
                value={nftContractInput}
                onChange={(e) => setNftContractInput(e.target.value)}
                placeholder="G..."
                spellCheck={false}
                autoComplete="off"
                disabled={isSubmitting || !onSetNftContract}
              />
            </label>
            <button
              type="submit"
              className="owner-settings__button owner-settings__button--primary"
              disabled={isSubmitting || !onSetNftContract}
            >
              Save NFT contract
            </button>
          </form>

          {/* transfer_ownership */}
          <form className="owner-settings__form" onSubmit={submitTransferOwnership}>
            <div className="owner-settings__form-header">
              <h3>Transfer ownership</h3>
              <span className="owner-settings__current" title={pendingOwner ?? undefined}>
                Pending: <strong>{truncateAddress(pendingOwner)}</strong>
              </span>
            </div>
            <label className="owner-settings__field">
              <span>New owner address</span>
              <input
                type="text"
                value={transferInput}
                onChange={(e) => setTransferInput(e.target.value)}
                placeholder="G..."
                spellCheck={false}
                autoComplete="off"
                disabled={isSubmitting || !onTransferOwnership}
              />
            </label>
            <button
              type="submit"
              className="owner-settings__button owner-settings__button--primary"
              disabled={isSubmitting || !onTransferOwnership}
            >
              Transfer ownership
            </button>
          </form>

          {/* accept_ownership (also available via banner) */}
          <div className="owner-settings__form">
            <div className="owner-settings__form-header">
              <h3>Accept ownership</h3>
              <span className="owner-settings__current" title={pendingOwner ?? undefined}>
                Pending: <strong>{truncateAddress(pendingOwner)}</strong>
              </span>
            </div>
            <p className="owner-settings__hint">
              Only the nominated address can accept ownership.
            </p>
            <button
              type="button"
              className="owner-settings__button owner-settings__button--primary"
              onClick={submitAcceptOwnership}
              disabled={isSubmitting || !onAcceptOwnership || !pendingOwner}
            >
              Accept ownership
            </button>
          </div>

          {/* upgrade */}
          <form className="owner-settings__form" onSubmit={submitUpgrade}>
            <div className="owner-settings__form-header">
              <h3>Upgrade contract</h3>
              <span className="owner-settings__current">
                Version: <strong>{currentVersion ?? '—'}</strong>
              </span>
            </div>
            <label className="owner-settings__field">
              <span>New WASM hash (64 hex chars)</span>
              <input
                type="text"
                value={wasmHashInput}
                onChange={(e) => setWasmHashInput(e.target.value)}
                placeholder="e.g. 0123abcd…"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={
                  wasmHashInput.length > 0 && !isValidWasmHash(wasmHashInput)
                }
                disabled={isSubmitting || !onUpgrade}
              />
            </label>
            {wasmHashInput.length > 0 && !isValidWasmHash(wasmHashInput) && (
              <p className="owner-settings__field-error" role="alert">
                WASM hash must be a 64-character hex string.
              </p>
            )}
            <button
              type="submit"
              className="owner-settings__button owner-settings__button--primary"
              disabled={isSubmitting || !onUpgrade || !isValidWasmHash(wasmHashInput)}
            >
              Upgrade
            </button>
          </form>

          {/* set_fee (LF-149) */}
          <form className="owner-settings__form" onSubmit={submitFee}>
            <div className="owner-settings__form-header">
              <h3>Fee</h3>
              <span className="owner-settings__current">
                Current: <strong>{currentFee ?? '—'}</strong>
              </span>
            </div>
            <label className="owner-settings__field">
              <span>New fee</span>
              <input
                type="number"
                min={0}
                step={1}
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                placeholder="e.g. 250"
                disabled={isSubmitting || !onSetFee}
              />
            </label>
            <button
              type="submit"
              className="owner-settings__button owner-settings__button--primary"
              disabled={isSubmitting || !onSetFee}
            >
              Save fee
            </button>
          </form>

          {/* set_treasury (LF-149) */}
          <form className="owner-settings__form" onSubmit={submitTreasury}>
            <div className="owner-settings__form-header">
              <h3>Treasury</h3>
              <span className="owner-settings__current" title={currentTreasury ?? undefined}>
                Current: <strong>{truncateAddress(currentTreasury)}</strong>
              </span>
            </div>
            <label className="owner-settings__field">
              <span>New treasury address</span>
              <input
                type="text"
                value={treasuryInput}
                onChange={(e) => setTreasuryInput(e.target.value)}
                placeholder="G..."
                spellCheck={false}
                autoComplete="off"
                disabled={isSubmitting || !onSetTreasury}
              />
            </label>
            <button
              type="submit"
              className="owner-settings__button owner-settings__button--primary"
              disabled={isSubmitting || !onSetTreasury}
            >
              Save treasury
            </button>
          </form>

          {/* pause / unpause (LF-174) */}
          <div className="owner-settings__form">
            <div className="owner-settings__form-header">
              <h3>Pause</h3>
              <span className="owner-settings__current">
                Status: <strong>{isPaused == null ? '—' : isPaused ? 'Paused' : 'Active'}</strong>
              </span>
            </div>
            <p className="owner-settings__hint">
              Pausing blocks all user interactions with the contract.
            </p>
            <button
              type="button"
              className={`owner-settings__button ${
                isPaused
                  ? 'owner-settings__button--primary'
                  : 'owner-settings__button--danger'
              }`}
              onClick={submitPauseToggle}
              disabled={
                isSubmitting || (isPaused ? !onUnpause : !onPause)
              }
            >
              {isPaused ? 'Unpause contract' : 'Pause contract'}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmation && (
        <div
          className="owner-settings__dialog-backdrop"
          role="presentation"
          onClick={closeConfirmation}
        >
          <div
            className="owner-settings__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-settings-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="owner-settings-dialog-title">{confirmation.title}</h3>
            <p>{confirmation.description}</p>
            <div className="owner-settings__dialog-actions">
              <button
                type="button"
                className="owner-settings__button"
                onClick={closeConfirmation}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="owner-settings__button owner-settings__button--primary"
                onClick={handleConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Confirming…' : confirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}