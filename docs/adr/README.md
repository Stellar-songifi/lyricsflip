# Architecture Decision Records (ADRs)

This directory contains the Architecture Decision Records for LyricsFlip. ADRs capture the important architectural decisions made on this project, the context in which they were made, and their consequences. They exist so that decisions are documented once and referenced, rather than re-argued in every pull request.

## What is an ADR?

An Architecture Decision Record is a short, immutable document that records a single significant decision. Once an ADR is accepted it is not edited to reflect new thinking — instead a new ADR is written that supersedes it. This keeps a durable history of *why* the system looks the way it does.

We follow the [MADR](https://adr.github.io/madr/) (Markdown Any Decision Records) format, simplified for this project.

## Statuses

| Status | Meaning |
| --- | --- |
| **Proposed** | Drafted and open for discussion. Not yet binding. |
| **Accepted** | Approved by a maintainer. Binding for new work. |
| **Rejected** | Considered and declined. Kept for the record. |
| **Superseded** | Replaced by a later ADR (which should be linked). |
| **Deprecated** | No longer relevant, but not replaced. |

All ADRs in this directory start as **Proposed** and remain so until a maintainer accepts them.

## Index

| ADR | Title | Tracking issue | Status |
| --- | --- | --- | --- |
| [ADR-0001](0001-answer-privacy.md) | Answer privacy | LF-142 | **Proposed** |
| [ADR-0002](0002-randomness-source.md) | Randomness source | LF-143 | **Proposed** |
| [ADR-0003](0003-escrow-design.md) | Escrow design | LF-135 | **Proposed** |
| [ADR-0004](0004-nft-transferability.md) | NFT transferability | LF-169 | **Proposed** |
| [ADR-0005](0005-backend-scope.md) | Backend scope | LF-226 | **Proposed** |
| [ADR-0006](0006-realtime-state-source-of-truth.md) | Source of truth for real-time state | LF-225 | **Proposed** |

## Template

Copy the block below into a new file named `NNNN-short-title.md` (zero-padded, sequential number) and fill it in. Keep the section headings exactly as shown so tooling and reviewers can rely on them.

```markdown
# ADR-NNNN: <Short title of the decision>

- **Status:** Proposed
- **Date:** YYYY-MM-DD
- **Tracking issue:** LF-XXX
- **Deciders:** <names / roles>
- **Related ADRs:** <links, if any>

## Context

Describe the forces at play: the problem being solved, the constraints
(technical, product, security, budget), the options considered, and why a
decision is needed now. Link to relevant issues, PRs, or prior discussion.

## Decision

State the decision in one or two sentences, in the active voice
("We will ..."). Then add any detail needed to make the decision
unambiguous and implementable.

## Consequences

List the outcomes of the decision — both positive and negative. Include
follow-up work, migration steps, and anything that becomes harder or easier
as a result. Note any risks and how they will be mitigated.

## Alternatives considered

Briefly list the options that were rejected and why. (Optional but
encouraged.)

## Status history

- YYYY-MM-DD — Proposed
```

## Process

1. Open an issue (or use the existing tracking issue) describing the decision to be made.
2. Add a new ADR file using the template above, numbered sequentially, with status **Proposed**.
3. Add a row to the index table in this README.
4. Link the ADR from [`docs/architecture.md`](../architecture.md) and from any issue that depends on it.
5. Discuss in the PR. When a maintainer approves, change the status to **Accepted** and record the date in the status history.
6. If a later decision changes course, write a new ADR and mark the old one **Superseded** with a link to its replacement.

## Conventions

- File names: `NNNN-kebab-case-title.md`.
- One decision per ADR.
- ADRs are append-only: never rewrite an accepted ADR's decision — supersede it instead.
- Every ADR must reference its tracking issue and be linked from `docs/architecture.md`.