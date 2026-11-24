# First-run onboarding

The home-page stepper guides a player through the first round:

1. **Connect a wallet** — links to wallet sign-in; wallet authentication is
   required before creating a username.
2. **Fund on testnet** — uses Friendbot for a connected testnet wallet. The
   step is skipped on networks that do not support Friendbot.
3. **Choose a username** — continues through the existing wallet-authenticated
   username flow.
4. **Play the tutorial round** — opens the quick-game flow from a short
   instructional card.

Completed account-backed steps are derived from the connected wallet, XLM
balance, and saved username. Starting the tutorial round is remembered per
wallet in local storage so returning players can skip the completed flow.

Funnel measurement is first-party and aggregate-only. The browser sends the
completed step name without wallet addresses or session identifiers; the
backend stores daily counts, and authorized analytics users can read the last
30 days at `/api/v1/analytics/onboarding-funnel`. Testnet funding and the
non-testnet funding skip are counted separately. Local counters are also kept
on-device. Storage or analytics failures do not block onboarding.

Design reference: [LyricsFlip onboarding screens](https://www.figma.com/design/6phOWkHKQgLRhRwmBBQDXB/LyricsFlip?node-id=715-5041&t=DYVCuWSnjHjRe0Co-4).
