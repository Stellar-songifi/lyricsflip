# LyricsFlip Issue Backlog

> **Record of open work**: This file tracks active, open, and planned issues for LyricsFlip. For the record of completed and merged work, see [`ISSUES.md`](ISSUES.md). For all 125+ tracked items and milestones, see [GitHub Issues](https://github.com/Stellar-songifi/lyricsflip/issues).

---

## On-chain

### LF-009 · Card selection randomness is predictable and caller-controlled

<a id="lf-009--card-selection-randomness-is-predictable-and-caller-controlled"></a>

**Area:** On-chain · **Priority:** P1 · **Type:** Bug / Security · **Effort:** M  
**Files:** `onchain/contracts/lyricsflip/src/lib.rs`

**Description**

`get_random_numbers` relied on caller-supplied `seed` combined with block metadata. Callers could predict card selections or supply seeds favoring certain card IDs. The contract must migrate to Soroban's native `env.prng()` to provide manipulation-resistant on-chain random selection.

**Tasks**

- [ ] Replace client-supplied seed with `env.prng()`.
- [ ] Remove seed argument from `create_round` and internal helper interfaces.
- [ ] Verify Fisher–Yates card shuffling draws exclusively from `env.prng()`.

**Acceptance criteria**

- [ ] Callers cannot bias, predict, or manipulate card selection.

---

## Frontend

### LF-198 · The wager modal must use real escrow

**Area:** Frontend · **Priority:** P1 · **Type:** Feature · **Effort:** M  
**Files:** `frontend/src/components/organisms/wager-modal.tsx`, `frontend/src/components/organisms/wager-summary-modal.tsx`, `frontend/src/lib/utils.ts`, `frontend/src/lib/stellar/client.ts`

**Description**

The wager modal must connect directly to real escrow parameters, converting stakes to stroops via `bigint` math, validating wallet balances against min/max limits and fee reserves, displaying true configured round rules instead of arbitrary odds/duration, and detailing the escrow deposit in the summary modal prior to signing.

**Tasks**

- [ ] Pass the stake, converted to stroops (7 decimals) with `bigint` math, to `create_round`.
- [ ] Remove the fields with no contract meaning (odds, duration), or map them to configured values.
- [ ] Show the wager token's balance and the min/max limits, and disable submission when the balance is too low.
- [ ] Show the escrow transfer in the summary modal before the player signs.

**Acceptance criteria**

- [ ] Creating a 5 XLM wager round moves 5 XLM into the contract (testnet).
- [ ] No form field is silently ignored.

**Related:** Reopened by [#890](https://github.com/Stellar-songifi/lyricsflip/issues/890) (LF-304): the stake is not sent on-chain until LF-256 adds wager arguments to `create_round`.

---

### LF-199 · Claim-winnings and refund UI

**Area:** Frontend · **Priority:** P1 · **Type:** Feature · **Effort:** S  
**Files:** `frontend/src/components/organisms/game-result-modal.tsx`, `frontend/src/components/organisms/game-result-popup.tsx`, `frontend/src/components/organisms/unclaimed-winnings.tsx`, `frontend/src/app/profile/page.tsx`

**Description**

After finalization, winners need a **Claim** button, losers should see what they lost, and a cancelled round should show its refund. The profile page should list rounds with unclaimed winnings. While UI buttons were added, on-chain execution currently throws `notImplemented('claimWinnings')` (tracked under LF-303).

**Tasks**

- [x] Add a Claim button to the result modal and popup, with pending, success, and error toasts.
- [ ] Winner can claim winnings with pull-payment contract call (`claimWinnings`/`claimEarnings`), and the button disappears once the claim succeeds.
- [x] Display clear breakdown for losers showing the wager amount lost.
- [x] Display refund breakdown and messaging for cancelled rounds.
- [x] Add an "Unclaimed winnings" section to `/profile` listing won rounds with real-time claim actions and toast feedback.

**Acceptance criteria**

- [ ] A winner can claim from the results screen and from the profile page, and the button disappears once the claim succeeds.
- [ ] No visible button leads to a "not implemented" error (LF-303).

**Related:** Tracked by [#889](https://github.com/Stellar-songifi/lyricsflip/issues/889) (LF-303).

---

## Backend

### Backend compilation, module structure, and database alignment (LF-073 – LF-081)

<a id="backend-backend"></a>

**Area:** Backend · **Priority:** P0 · **Type:** Bug · **Effort:** L  
**Files:** `backend/src/main.ts`, `backend/src/app.module.ts`, `backend/package.json`

**Description**

The backend currently does not compile. Missing module imports, syntax discrepancies in package configuration, and alignment with the database schema must be resolved module by module so the service builds and boots cleanly.

**Tasks**

- [ ] Align module declarations and eliminate dead imports in `app.module.ts`.
- [ ] Validate environment configuration and database connectivity at boot.
- [ ] Restore entity definitions and run migration checks without drift.

**Acceptance criteria**

- [ ] `npm run build` succeeds in `backend/`.
- [ ] Unit and e2e test suites run and pass.

---

## DevOps

### LF-106 · CI workflow for the frontend

<a id="lf-106--ci-workflow-for-the-frontend"></a>

**Area:** DevOps · **Priority:** P1 · **Type:** DevEx · **Effort:** S  
**Files:** `.github/workflows/frontend.yml`

**Description**

Continuous integration pipeline for the Next.js frontend application.

**Tasks**

- [x] Add workflow running ESLint, TypeScript compiler checks (`tsc --noEmit`), Jest unit tests with coverage, and production build on every pull request.

**Acceptance criteria**

- [x] Frontend CI passes on every pull request touching frontend code.

---

### LF-107 · CI workflow for the backend

<a id="lf-107--ci-workflow-for-the-backend"></a>

**Area:** DevOps · **Priority:** P1 · **Type:** DevEx · **Effort:** S  
**Files:** `.github/workflows/backend.yml`

**Description**

Continuous integration pipeline for the NestJS backend application.

**Tasks**

- [x] Add workflow running ESLint, TypeScript compiler checks, database migration checks, and Jest tests on every pull request.

**Acceptance criteria**

- [x] Backend CI executes and reports status on pull requests touching backend code.
