# LyricsFlip Documentation Index

Welcome to the LyricsFlip documentation index. This page categorizes all technical, product, operational, and design documentation across the repository.

---

## Table of Contents

- [Product](#product)
- [Architecture](#architecture)
- [Contracts](#contracts)
- [Operations](#operations)
- [Security](#security)
- [Design](#design)
- [Issue Specifications](#issue-specifications)

---

## Product

- [Game Rules](game-rules.md) — Comprehensive rules covering Solo, Multiplayer, and Wager modes, round lifecycles, scoring, and streaks.
- [Content Policy](content-policy.md) — Standards, licensing guidelines, and content curation rules for submitted lyrics and song catalogues.
- [Notion Workspace](notion-link.md) — Link to the external Notion product roadmap and project tracker.

---

## Architecture

- [System Architecture](architecture.md) — High-level architecture, component hierarchy, off-chain/on-chain boundaries, and protocol interactions.
- [Real-time Protocol](realtime-protocol.md) — WebSocket event schemas, state machine synchronization, and client-server payload formats.
- [Architecture Decision Records (ADRs)](adr/README.md) — Process, MADR template, and directory of architectural decisions.

---

## Contracts

- [Contract API Reference](../onchain/docs/api.md) — Generated reference for all public functions, storage data keys, error codes, and events for `lyricsflip` and `lyricsflip-nft`.
- [Answer Privacy on Ledger](../onchain/docs/answer-privacy.md) — Threat analysis and redaction mechanisms preventing ledger answer snooping during active rounds.
- [ADR LF-248: Answer Privacy](../onchain/docs/adr/LF-248-answer-privacy.md) — Architectural decision record formalizing the redaction-first ledger privacy model.

---

## Operations

- [Incident Runbook](incident-runbook.md) — Emergency operational runbook for contract pause/unpause, admin rotation, badge recovery, and incident response.
- [Mainnet Readiness Checklist](mainnet-checklist.md) — Pre-flight requirements, security auditing checklists, network configurations, and deployment steps for Stellar Mainnet.

---

## Security

- [Threat Model](security/threat-model.md) — Threat modeling document detailing trust assumptions, attack vectors, PRNG manipulation risks, and mitigations.

---

## Design

- [Design Handoff](design/handoff.md) — Figma design-to-code implementation guidelines, component layout specifications, and style tokens.
- [Onboarding Flow](design/onboarding-flow.md) — User onboarding journey, wallet connection screens, and network setup specifications.
- [User Profile](design/user-profile.md) — Profile dashboard design, gameplay statistics, win streaks, and milestone NFT badge gallery.
- [Contributors Design Guide](design/contributors.md) — Design contribution workflows, brand assets, and Figma component usage rules.

---

## Issue Specifications

- [LF-295 Specification](issues/881-lf-295-frontend-ci-calls-scripts-and-fol.md) — Specification for standardizing frontend CI script execution and folder structures.
- [LF-296 Specification](issues/882-lf-296-replace-the-hand-typed-contract-c.md) — Specification for replacing hand-typed contract clients with generated TypeScript bindings.
- [LF-297 Specification](issues/883-lf-297-single-player-should-use-create-s.md) — Specification for single-player round creation refactoring.
- [LF-298 Specification](issues/884-lf-298-remove-client-supplied-seeds-from.md) — Specification for removing client-supplied randomness seeds in favor of Soroban `env.prng()`.
