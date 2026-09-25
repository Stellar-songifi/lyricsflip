# Architecture

This document stays aligned with the project README, especially the "How the game works" flow and the architecture summary.

## Component overview

```mermaid
flowchart LR
    subgraph Browser
        UI["Next.js frontend\nReact, Tailwind, Zustand"]
        WALLET["Stellar wallet\nFreighter / xBull / Albedo / Lobstr / Hana"]
    end

    subgraph Stellar["Stellar network (Soroban)"]
        GAME["lyricsflip contract\nrounds, cards, answers, stats"]
        NFT["lyricsflip-nft contract\nreward badges"]
    end

    subgraph Server
        API["NestJS API\nREST + Socket.IO"]
        DB[("PostgreSQL")]
        REDIS[("Redis")]
    end

    UI -- "sign tx" --> WALLET
    UI -- "simulate / send contract call" --> GAME
    UI -- "simulate / send contract call" --> NFT
    UI -- "HTTP / WebSocket" --> API
    API --> DB
    API --> REDIS
    GAME -. "cross-contract mint" .-> NFT
    API -. "indexing / off-chain enrichments" .-> GAME
```

## Round lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor A as Player A
    actor B as Player B
    participant C as LyricsFlip contract
    participant N as LyricsFlip NFT contract

    A->>C: create_round(caller=A, genre, seed)
    C-->>A: round_id (RoundCreated)
    B->>C: join_round(caller=B, round_id)
    C-->>B: RoundJoined
    A->>C: start_round(caller=A, round_id)
    C-->>A: PlayerReady
    B->>C: start_round(caller=B, round_id)
    C-->>B: PlayerReady
    C-->>A: RoundStarted
    loop for each card
        A->>C: next_card(round_id)
        C-->>A: Card
        A->>C: build_question_card(card, seed, kind)
        C-->>A: QuestionCard
        A->>C: submit_answer(caller=A, round_id, answer)
        B->>C: submit_answer(caller=B, round_id, answer)
        C-->>A: correct / false
    end
    A->>C: finalize_round(caller=A, round_id)
    C-->>A: RoundCompleted
    A->>C: claim_reward(caller=A, milestone)
    C->>N: mint(caller=game contract, recipient=A)
    N-->>A: token_id
```

## Lifecycle and ownership summary

The game flow matches the README's player-facing flow:

1. Create a round.
2. Invite players and let them join.
3. Everyone marks ready.
4. The round starts on-chain.
5. Each card is drawn and answered.
6. The round is finalized.
7. Milestone claims mint reward NFTs.

## Data ownership: chain vs. database

| Concern | Source of truth | Notes |
|---|---|---|
| Game state and fairness | Stellar chain / Soroban contracts | Round state, card catalogue, answer checks, winner selection, per-player stats, minting flows |
| NFT ownership and rewards | Stellar chain / NFT contract | Token ownership and transfer history are on-chain |
| Wallet signers and session UX | Frontend only | The browser keeps the wallet connection and local UI state; it does not own persisted game truth |
| Profiles, leaderboards, chat, notifications, realtime relay | Backend database | PostgreSQL/Redis store off-chain social data, metadata, and real-time sessions |
| Song metadata and curation | Backend database and API | The chain stores gameplay facts; the backend stores non-critical social or editorial data |
| Contract event indexing | Backend indexer / API | Useful for analytics, feeds, and UI queries beyond raw on-chain reads |

## Ownership model

- The Soroban contracts are the source of truth for all value-bearing and fairness-critical state.
- The frontend is a client that reads chain data and submits signed transactions.
- The backend is an off-chain extension that enriches the game with profiles, social features, and indexable events.
- The contract is not replaced by the database; the database is for user experience and operational data, not game authority.

## Implementation notes

- The frontend reads from the chain and the API; it never becomes the authoritative store for game state.
- The `lyricsflip` contract owns the round logic and answer validation.
- The `lyricsflip-nft` contract owns the reward token lifecycle and ownership semantics.
- The backend can index contract events, but the chain remains the root of trust.
