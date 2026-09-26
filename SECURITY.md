# Security Policy

LyricsFlip handles on-chain wagers and NFTs, so we take vulnerability reports seriously. Please report issues privately and give us time to fix them before any public disclosure.

## Supported Versions

LyricsFlip has no tagged releases yet. Only the latest commit on `main` receives security fixes.

| Version         | Supported |
| --------------- | --------- |
| `main` (latest) | Yes       |
| Anything older  | No        |

## Scope

- Soroban smart contracts in `onchain/` (wagering, rewards, NFT minting, upgradeability)
- Backend API and WebSocket gateway in `backend/`
- Frontend app and wallet integration in `frontend/`

Vulnerabilities in third-party dependencies should be reported to their maintainers. Let us know as well if LyricsFlip is affected.

## Reporting a Vulnerability

Do not open a public issue, pull request, or discussion for security problems.

Report privately through GitHub Security Advisories:

1. Go to [Report a vulnerability](https://github.com/Stellar-songifi/lyricsflip/security/advisories/new).
2. Describe the issue, the affected component, steps to reproduce, and the potential impact.
3. Include a proof of concept if you have one (a failing test, transaction, or request sequence).

If you cannot use GitHub Security Advisories, email ejiro@gmail.com with the subject `[LyricsFlip Security]`.

## Response Timelines

| Stage                               | Target                            |
| ----------------------------------- | --------------------------------- |
| Acknowledge the report              | Within 72 hours                   |
| Triage and confirm severity         | Within 7 days                     |
| Fix for critical or high severity   | Within 30 days of confirmation    |
| Fix for medium or low severity      | Next planned release              |

We will keep you updated through the advisory thread, credit you in the published advisory unless you prefer to stay anonymous, and coordinate a disclosure date with you once a fix is available.
