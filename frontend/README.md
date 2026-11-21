# LyricsFlip Frontend

The web client for LyricsFlip, built with [Next.js](https://nextjs.org) (App Router) and TypeScript.

For the project overview, architecture, and contribution guidelines, see the [root README](../README.md).

## Status

This frontend is under active development. For current progress, open work, and known gaps, see the project [milestones](https://github.com/Stellar-songifi/lyricsflip/milestones) and [`ISSUES.md`](../ISSUES.md). This README intentionally does not track individual bugs or feature status — those live in the issue tracker.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Contract APIs

The frontend talks to the LyricsFlip contracts on Stellar/Soroban. Do not rely on hand-copied function signatures in this README — the canonical, generated reference for contract functions, events, and errors lives in [`onchain/docs/api.md`](../onchain/docs/api.md).

## Project Structure

- `app/` — Next.js App Router pages and layouts
- `components/` — reusable UI components
- `lib/` — shared utilities and contract client helpers

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Keeping Docs Up to Date

If your change alters behavior, update this README (or the relevant docs) in the same pull request. The PR template includes a checklist item for this.