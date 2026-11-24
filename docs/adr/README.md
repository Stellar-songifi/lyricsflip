# Architecture Decision Records (ADRs)

This directory contains the Architecture Decision Records for LyricsFlip. ADRs capture the important architectural decisions made on this project, the context in which they were made, alternatives considered, and their consequences. They exist so that decisions are documented once and referenced, rather than re-argued in every pull request.

## Canonical ADR Location

`docs/adr/` is the single canonical home for all Architecture Decision Records across the LyricsFlip project, covering smart contracts, frontend, backend, protocols, and security.

We follow the [MADR](https://adr.github.io/madr/) (Markdown Any Decision Records) format, using the template in [`template.md`](template.md).

## Statuses

| Status | Meaning |
| --- | --- |
| **Proposed** | Drafted and open for discussion. Not yet binding. |
| **Accepted** | Approved by maintainers. Binding for new work. |
| **Rejected** | Considered and declined. Kept for the record. |
| **Superseded** | Replaced by a later ADR (which should be linked). |
| **Deprecated** | No longer relevant, but not replaced. |

## Index

| ADR | Title | Tracking issue | Status |
| --- | --- | --- | --- |
| [ADR-0001](0001-answer-privacy.md) | Answer privacy on the ledger | LF-142, LF-248 | **Accepted** |
| [ADR-0002](0002-randomness-source.md) | Randomness source for card selection and shuffling | LF-143, LF-009, LF-298 | **Accepted** |
| [ADR-0003](0003-escrow-design.md) | Escrow architecture and pull-payment claims | LF-135, LF-259, LF-260 | **Accepted** |
| [ADR-0004](0004-nft-transferability.md) | Soulbound NFT badges and transferability | LF-169 | **Accepted** |
| [ADR-0005](0005-backend-scope.md) | Backend architecture and off-chain scope | LF-226 | **Accepted** |
| [ADR-0006](0006-realtime-source-of-truth.md) | Source of truth for real-time multiplayer state | LF-225, LF-197 | **Accepted** |
| [ADR-0007](0007-solo-round-entry-points.md) | Solo and combined round entry points | LF-163, LF-164, LF-297 | **Accepted** |

## Template

The project template is maintained in [`template.md`](template.md):

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

Briefly list the options that were rejected and why.

## Status history

- YYYY-MM-DD — Proposed
```

## Process

1. Open an issue (or use the existing tracking issue) describing the decision to be made.
2. Add a new ADR file using `template.md`, numbered sequentially, with status **Proposed**.
3. Add a row to the index table in this README.
4. Link the ADR from [`docs/architecture.md`](../architecture.md) and from any issue that depends on it.
5. Discuss in the PR. When maintainers approve, change the status to **Accepted** and record the date in the status history.
6. If a later decision changes course, write a new ADR and mark the old one **Superseded** with a link to its replacement.
