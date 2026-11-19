# Incident Runbook (LF-250)

Operational procedures for responding to incidents on LyricsFlip. Keep this
runbook current; rehearse it on testnet before mainnet launch.

## Severity

- **SEV1** — funds at risk, contract compromised, or total outage.
- **SEV2** — degraded service (stuck rounds, high error rate, indexer lag).
- **SEV3** — minor issues with a workaround.

## 1. Pausing the contracts

1. Confirm the incident and severity; page the on-call owner.
2. Using the owner multisig/hardware wallet, invoke the contract pause entrypoint.
3. Verify the paused state blocks state-changing calls (submit_answer, round
   finalization, escrow withdrawals).
4. Record the pause timestamp and reason in the incident channel.
5. Do **not** resume until the root cause is understood and fixed.

## 2. Rolling back the frontend

1. Identify the last known-good deployment (tag or commit).
2. Redeploy the previous build via the hosting provider's rollback.
3. Verify critical flows (connect wallet, view rounds, submit answer) against the
   rolled-back build.
4. Announce the rollback in the incident channel and status page.

## 3. Communicating with users

1. Post an initial status update within 15 minutes of a SEV1/SEV2.
2. State what is affected, what users should do (e.g. do not submit answers),
   and when the next update will come.
3. Provide updates at least every 30 minutes until resolved.
4. After resolution, publish a short post-incident summary.

## 4. Revoking and restoring a milestone badge (LF-284)

Revoke a badge minted in error:

1. Burn it from the NFT contract with the owner key:
   `stellar contract invoke --id <NFT_ID> -- burn_from --spender <OWNER> --owner <PLAYER> --token_id <TOKEN_ID>`.
2. Leave the game contract's `MilestoneClaimed` flag set, so the player
   cannot claim the badge again.

Restore a badge that was revoked or burned by mistake:

1. Clear the claimed flag on the game contract with the owner key:
   `stellar contract invoke --id <GAME_ID> -- reset_milestone --caller <OWNER> --player <PLAYER> --milestone <FirstWin|Streak5|TenWins>`.
2. Confirm a `MilestoneReset` event was emitted and that
   `is_milestone_claimed` now returns `false`.
3. Ask the player to call `claim_reward` again. A new token id is minted.

## 5. Post-incident

- File follow-up issues for root cause and prevention.
- Update this runbook and the monitoring alerts if gaps were found.
