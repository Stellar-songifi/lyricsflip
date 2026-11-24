# Threat Model & Invariants

This document is the supporting security analysis for the LyricsFlip project. It
complements [`SECURITY.md`](../../SECURITY.md) and should be read before
escrowing real funds (LF-146).

- **Scope:** on-chain contracts under `onchain/contracts/*`, the backend keeper,
  and the frontend/backend web applications.
- **Out of scope:** the Stellar network itself, Soroban host implementation, and
  third-party wallet software.

---

## 1. Actors

| Actor | Trust level | Capabilities | Notes |
| --- | --- | --- | --- |
| **Player** | Untrusted | Joins lobbies, submits answers, claims rewards. | May run many accounts (sybil) and scripted clients. |
| **Round admin** | Semi-trusted | Creates rounds, configures round parameters (entry fee, timing, card set). | Cannot move escrowed funds directly; can grief by misconfiguring. |
| **Card admin** | Semi-trusted | Adds/updates cards (lyrics, answers, metadata) and mints NFTs. | Controls answer correctness; a malicious card admin can leak answers. |
| **Owner** | Trusted (multisig recommended) | Upgrades contracts, sets admins, pauses, withdraws protocol fees. | Highest-privilege role; compromise is catastrophic. |
| **Backend keeper** | Semi-trusted | Submits transactions on behalf of the protocol (finalization, settlement, oracle-ish duties). | Holds a hot key; must be least-privilege and rate-limited. |
| **RPC provider** | Untrusted | Serves ledger state, submits transactions, may reorder/censor/delay. | Must not be trusted for correctness; contracts must validate on-chain. |

### Trust assumptions

- The **owner** key is held in a multisig / hardware wallet; single-key owner
  operation is a known risk accepted only pre-mainnet.
- The **backend keeper** key is a hot key with limited authority; it can only
  perform idempotent, on-chain-validated actions.
- The **RPC provider** is assumed Byzantine: it may lie, censor, or reorder, but
  cannot forge signatures. All security decisions are enforced on-chain.

---

## 2. Assets

| Asset | Location | Impact if compromised |
| --- | --- | --- |
| **Escrow** (entry fees, prize pools) | Contract token balances | Direct loss of player funds. |
| **NFTs** (card collectibles / rewards) | Contract + player wallets | Theft, duplication, or unauthorized minting. |
| **Stats** (scores, streaks, leaderboards) | Contract storage + backend DB | Reputation/integrity loss, unfair rewards. |
| **Admin/keeper keys** | Off-chain secrets | Full protocol compromise if leaked. |
| **Answer keys** (correct answers) | Contract storage / backend | Game integrity; leakage enables cheating. |

---

## 3. Attacks & Mitigations

### 3.1 Answer leakage
**Threat:** Correct answers are exposed before a round ends (via storage reads,
backend APIs, logs, or a malicious card admin), letting players cheat.

**Mitigations:**
- Do not store plaintext answers in publicly readable storage during an active
  round; commit to a hash and reveal after finalization, or gate reads.
- Backend endpoints serving round data must never include answer fields until
  the round is finalized.
- Card admin changes to an active round's answers are rejected.
- Audit logs must not print answer material.

### 3.2 Seed grinding
**Threat:** A player (or colluding keeper) influences or predicts the randomness
used to select cards/questions, biasing outcomes.

**Mitigations (LF-268):**
- Card and option randomness is drawn from `env.prng()` (Soroban's host PRNG)
  via `shuffle`/`gen_range` at draw time. No public function accepts a
  caller-supplied seed: the `seed` parameter was removed from `create_round`,
  `create_round_with_filter`, `create_solo_round`, `get_cards_of_*`, and
  `build_question_card` (breaking ABI change; `VERSION` bumped).
- Options are shuffled per player and per card at draw time, and the correct
  option index is stored so it can be returned after finalization (LF-254).
  Option order is no longer derived from `round_id`, so players cannot predict
  where the correct option sits.
- The frontend no longer sends a `randomSeed`; callers cannot influence draws.

**Residual risk (validator-level):** `env.prng()` is not a VRF. Validators can
observe the PRNG output and, in principle, influence or bias it (e.g. by
choosing whether to include a transaction or by manipulating ledger inputs).
This is accepted for casual/low-value rounds. For high-value wagered rounds,
use a commit–reveal scheme or an external randomness oracle instead of relying
on the host PRNG.

### 3.2a Private-round invite leakage
**Threat (LF-264):** Private rounds originally stored `sha256(invite_code)` and
`join_round` took the **plaintext** `invite_code` as an argument. Transaction
arguments are public on Stellar, so once the first invitee joined, anyone
reading the ledger or the RPC `getTransactions` could copy the code and join —
defeating "private" rounds and letting strangers into wagered games.

**Mitigations:**
- Shared-secret invite codes are removed. `create_round` takes an admin-supplied
  `invitees: Vec<Address>` allowlist, and `join_round` rejects any caller not on
  that allowlist. No secret is ever passed as a transaction argument.
- A bad or missing invite now fails with the dedicated `Error::InvalidInvite`
  instead of the generic `NotAuthorized`.
- **Acceptance:** a third party who has observed an earlier `join_round`
  transaction cannot join the private round.
=======

### 3.3 Griefing lobbies
**Threat:** An attacker joins lobbies and never plays, or creates and abandons
lobbies to lock funds or deny service.

**Mitigations:**
- Entry fees are escrowed and refundable only via defined timeout paths.
- Lobbies have join/start deadlines; unfilled lobbies expire and refund.
- Rate-limit lobby creation per account; require minimum stake to create.

### 3.4 Abandoned rounds
**Threat:** A round is started but never finalized (keeper offline, admin
absent), leaving escrow stuck.

**Mitigations:**
- Permissionless finalization after a deadline: anyone (including players) can
  finalize an expired round.
- Keeper is idempotent and retried; finalization is safe to call multiple times
  (see invariant I3).
- Refund path for rounds that never reach quorum.

### 3.5 Key compromise
**Threat:** Owner, card admin, or keeper key is stolen.

**Mitigations:**
- Owner operations require multisig; upgrades time-locked.
- Keeper key is least-privilege and rotatable without redeploy.
- Card admin cannot move funds; separation of duties between roles.
- Pause switch (owner) to halt escrow operations during incident response.
- Key rotation and incident-response runbook referenced from `SECURITY.md`.

### 3.6 Additional considerations
- **Reentrancy / double-spend:** state is updated before token transfers; claims
  are marked before payout (see I2).
- **Integer overflow:** checked arithmetic in all balance math (see I1).
- **RPC censorship/reordering:** clients must confirm finality; keeper retries
  with idempotent operations.


### 3.7 Escrow funds (LF-256 to LF-263)
**Threat:** Entry fees and prize pools are lost or released to the wrong party.

**Mitigations (in code):**
- Escrowed rounds move through a fixed lifecycle: `Open → Locked → Settled`, or
  `Open|Locked → Cancelled`
  ([`lyricsflip-escrow/src/lib.rs`](../../onchain/contracts/lyricsflip-escrow/src/lib.rs)).
- The protocol fee is bounded: `fee_bps` must be between 0 and 10 000 (100%), enforced in
  the constructor and `set_fee`.

**Open:** the per-issue links for LF-257 to LF-263 are not recorded in `ISSUES.md`, so the
mitigations above are not yet linked to them. Add the issue numbers before mainnet.

### 3.7a Answer side channels (LF-278)
**Threat:** A public view, event or lookup maps a live card to its answer, letting a player
read the answer before answering.

**Mitigations (in code):**
- `got_question` returns only the lyric and options for the caller's current card
  ([ADR LF-248](../../onchain/docs/adr/LF-248-answer-privacy.md)).
- `get_card` redacts live cards; `get_cards_of_genre`, `get_cards_of_artist` and
  `get_cards_of_a_year` no longer return answers during an active round
  ([`cards.rs`](../../onchain/contracts/lyricsflip/src/cards.rs),
  [`events.rs`](../../onchain/contracts/lyricsflip/src/events.rs)).
- Tests: [`test/privacy.rs`](../../onchain/contracts/lyricsflip/src/test/privacy.rs).

**Residual risk:** the answer is still in contract storage, so a direct ledger inspection can
read it. This is a known trade-off recorded in ADR LF-248.

### 3.8 Keeper key compromise (LF-335)
**Status: not verified in code.** The keeper key is read from configuration
([`backend/src/config/configuration.ts`](../../backend/src/config/configuration.ts)). The
rotation and least-privilege statements in section 3.5 describe the intended design and are
not yet backed by a runbook. Open until the keeper key is rotated without a redeploy and the
runbook is written.

### 3.9 Wallet-auth replay (LF-337)
**Threat:** A captured signed challenge is replayed to obtain a session.

**Mitigations (in code):**
- Each challenge carries a random 32-byte nonce with a TTL, stored under the address.
- The nonce is deleted before the signature is checked, so it can be used once, even when the
  replayed request carries a valid signature
  ([`wallet-auth.provider.ts`](../../backend/src/auth/providers/wallet-auth.provider.ts)).

### 3.10 Socket spoofing (LF-339)
**Status: OPEN.** The real-time gateway
([`room.gateway.ts`](../../backend/src/room/room.gateway.ts)) associates a socket with a
`playerId` taken from the client-supplied handshake `query` or `auth` payload, then joins it to
the `player:<id>` room. Nothing verifies that the socket owns that player. A client can therefore
claim another player's identity and receive that player's events. Fix by deriving `playerId`
from the authenticated session, not from the handshake, before mainnet.

---

## 4. Invariants

Each invariant is enforced in code and covered by a test. Tests live in
`onchain/contracts/*/src/test.rs`.

### I1 — Token conservation
> The sum of all token balances held by the contract plus all amounts paid out
> equals the sum of all amounts deposited. No operation creates or destroys
> tokens.

- **Enforced by:** escrow deposit/withdraw/claim paths using checked arithmetic
  and transferring exactly the recorded amounts.
- **Test:** `test_token_conservation` in
  [`onchain/contracts/escrow/src/test.rs`](../../onchain/contracts/escrow/src/test.rs)
  — deposits, plays a full round, and asserts
  `contract_balance + total_paid_out == total_deposited`.

### I2 — At most one claim per player per round
> A given player address can claim a reward for a given round at most once.

- **Enforced by:** a per-(round, player) `claimed` flag set *before* transfer;
  subsequent claims revert.
- **Test:** `test_double_claim_rejected` in
  [`onchain/contracts/escrow/src/test.rs`](../../onchain/contracts/escrow/src/test.rs)
  — claims once successfully, then asserts a second claim panics/reverts and the
  balance is unchanged.

### I3 — A finalized round is never re-finalized
> Once a round is marked finalized, any further finalization attempt is a no-op
> or reverts; the recorded outcome and payouts are immutable.

- **Enforced by:** a `finalized` flag checked at the top of the finalize path;
  finalization is idempotent and cannot alter prior payouts.
- **Test:** `test_finalize_is_idempotent` in
  [`onchain/contracts/round/src/test.rs`](../../onchain/contracts/round/src/test.rs)
  — finalizes a round, captures state, calls finalize again, and asserts state
  and balances are unchanged.

> **Maintenance:** when adding a new invariant, add it here with a link to its
> test. CI (`cargo test`) must pass for these tests on every PR.

---

---

## 5. HTTP Rate-Limit Budget Table (LF-350)

The backend enforces per-route throttle limits via `@nestjs/throttler` with a
Redis-backed shared counter.  Limits are keyed by **authenticated wallet address
first**, then by JWT subject, then by IP — meaning a single attacker who
authenticates cannot hide behind shared NAT, and a NAT network is not penalised
for one bad actor on it.

The global `APP_GUARD` (`CustomThrottlerGuard`) applies the default budget to
every HTTP route.  Routes listed below carry a tighter `@Throttle()` override
that the guard resolves automatically (method-level metadata takes precedence
over class-level, which takes precedence over the global default).

| Route | Method | Tier | Limit | TTL | Rationale |
|---|---|---|---|---|---|
| `/api/v1/*` (all others) | any | `DEFAULT` | 60 req | 60 s | Broad safety net |
| `/api/v1/auth/*` | POST | `AUTH` | 5 req | 60 s | Brute-force / credential stuffing protection |
| `/api/v1/auth/forgot-password` | POST | `FORGOT_PASSWORD` | 3 req | 60 s | Email-send abuse |
| `/api/v1/auth/reset-password` | POST | `RESET_PASSWORD` | 5 req | 60 s | Token-exhaustion protection |
| `/api/v1/game-session/:id/guess` | POST | `ANSWER` | 10 req | 60 s | Prevents automated answer flooding |
| `/api/v1/songs` | GET | `SEARCH` | 20 req | 60 s | Full-text DB scan; cache-bypass protection |
| `/api/v1/songs/recommended` | GET | `RECOMMENDED` | 15 req | 60 s | Multi-table preference join |
| `/api/v1/leaderboard` | GET | `LEADERBOARD` | 30 req | 60 s | Aggregation query; can be served from cache but direct calls capped |
| `/api/v1/leaderboard/rank/:id` | GET | `LEADERBOARD` | 30 req | 60 s | Per-player rank lookup |
| `/api/v1/players/:address` | GET | `PLAYER_PROFILE` | 20 req | 60 s | Cross-table stat aggregation per address |

**WebSocket budget** (`WsRateLimitGuard` — in-process per node):

| Namespace | Handler | Limit | Window | Key |
|---|---|---|---|---|
| `/game` | all message handlers | 60 msg | 10 s | wallet address → JWT sub → socket ID |
| `/rooms` | `room:join`, `room:leave` | 60 msg | 10 s | wallet address → JWT sub → socket ID |
| `/rounds` | `room:join`, `room:leave`, `room:ready` | 60 msg | 10 s | wallet address → JWT sub → socket ID |

> **Note:** WebSocket limits are enforced in-process and are not shared across
> backend instances.  Sessions are sticky to a single node in the current
> deployment, so this is acceptable; if sticky sessions are removed, migrate
> `WsRateLimitGuard` to Redis-backed storage.

---

## 6. Automated checks

The following run on every PR (see `.github/workflows/`):

- `cargo audit` — Rust dependency vulnerabilities (on-chain + backend).
- `npm audit --omit=dev` — frontend and backend production dependencies.
- CodeQL — static analysis for supported languages.

See [`SECURITY.md`](../../SECURITY.md) for how to report vulnerabilities.