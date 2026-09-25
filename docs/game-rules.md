# Game Rules & Glossary

This document is the single source of truth for LyricsFlip game rules. It defines each game mode, the round lifecycle, scoring, winner selection, wager escrow and payout, fees, refunds, and NFT milestones. It also defines the UI terms used across the app and maps each one to contract behaviour (or flags it for removal).

Related issues: LF-005 (wager escrow), LF-013 (scoring), LF-014 (payouts).

## Game Modes

| Mode | Description | Wager |
| --- | --- | --- |
| Solo | A single player completes a round against the card timer. No opponent, no pot. | None |
| Head-to-head | Two players are matched into a round. Both stake an equal wager into escrow. | Equal stakes |
| Tournament | Bracket of head-to-head rounds; winners advance until a single champion remains. | Equal stakes per round |

## Round Lifecycle

1. **Lobby** — players join a mode. Head-to-head and tournament rounds require both players to stake before the round starts.
2. **Escrow** — each player's wager is transferred into the escrow contract (LF-005). The round cannot start until all required stakes are escrowed.
3. **Active** — the round begins and the card timer starts.
4. **Submission** — each player submits their answer before the card timer expires.
5. **Resolution** — answers are scored, a winner is selected, and the pot is paid out (LF-014).
6. **Settled** — the round is final; results are recorded and any refunds are issued.

## Card Timer

- Each card has a fixed duration, shown in the UI as **duration**.
- The timer starts when the round enters the **Active** state.
- A submission received after the timer expires is rejected and counts as no submission for that card.
- If a player does not submit before the timer expires, the round is resolved against them (see *Timeouts*).

## Scoring

- Each correct answer awards points based on the card's **difficulty**.
- Higher difficulty cards award more points than lower difficulty cards.
- Incorrect or missing answers award zero points for that card.
- The round score is the sum of points across all cards in the round.

## Streaks

- Consecutive correct answers form a **streak**.
- A streak increases the points awarded for subsequent correct answers, up to a documented cap.
- An incorrect or missing answer resets the streak to zero.

## Winner Selection

- **Solo:** the player wins by completing the round; there is no opponent and no pot.
- **Head-to-head:** the player with the higher round score wins.
- **Ties:** if both players have the same score, the round is a tie. The escrowed wagers are refunded to each player (see *Refunds*); no pot is paid out.
- **Timeouts:** if a player fails to submit before the card timer expires, the opponent wins by default. If both players time out, the round is a tie and wagers are refunded.
- **Tournament:** the winner of each head-to-head round advances; the final round winner is the champion.

## Wager Escrow & Payout

- Wagers are held in escrow (LF-005) for the duration of the round.
- On resolution, the escrowed wagers form the **pot**.
- The winner receives the pot minus the protocol fee (LF-014).
- On a tie, the pot is not paid out; each player's wager is refunded.

## Fees

- A protocol fee is deducted from the pot before payout (LF-014).
- The fee rate is defined by the contract and is the same for all head-to-head and tournament rounds.
- Solo rounds have no pot and therefore no fee.

## Refunds

- Ties refund each player's escrowed wager in full.
- Cancelled rounds (for example, a round that never reaches the required number of staked players) refund all escrowed wagers in full.
- Refunds are issued during the **Settled** state.

## NFT Milestones

- Completing defined milestones (for example, winning a set number of rounds or reaching a streak threshold) mints an NFT to the player.
- Milestones are evaluated at round settlement.
- Each milestone NFT is minted at most once per player.

## Glossary

| UI term | Meaning | Contract behaviour |
| --- | --- | --- |
| **Odds** | Not a contract concept. The contract has no notion of odds or probability of winning. | **Remove from the UI.** Do not display odds; there is no contract value to map it to. |
| **Pot** | The total escrowed wagers for a head-to-head or tournament round. | Maps to the escrow balance for the round (LF-005). Paid to the winner minus the protocol fee (LF-014). |
| **Potential win** | The amount a player would receive if they win. | Maps to `pot - protocol fee`. Must be computed from the escrowed pot and the contract fee rate, not from odds. |
| **Difficulty** | How hard a card is. | Maps to the card's point value; higher difficulty awards more points. |
| **Duration** | How long a player has to answer a card. | Maps to the card timer; submissions after expiry are rejected. |

## References

- LF-005 — wager escrow
- LF-013 — scoring
- LF-014 — payouts and fees
