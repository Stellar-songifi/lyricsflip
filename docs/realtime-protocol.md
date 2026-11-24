# LyricsFlip Real-Time Multiplayer Protocol

## Overview

This document specifies the real-time communication protocol between the LyricsFlip
client and server using WebSocket (Socket.IO).  The server acts as a **relay** for
on-chain state and events; the Soroban blockchain is the authoritative source of
truth for game correctness, scoring, and results.

## Architecture

- **Namespaces**: `/game` for game state and gameplay events
- **Transport**: WebSocket with Socket.IO (fallback to polling)
- **Authentication**: Wallet JWT token in socket handshake (see §Security model)
- **CORS**: Configured via environment variable `CORS_ORIGINS`

---

## Security Model (LF-339)

### Authentication

Every socket connection **must** present a valid access token obtained through
the wallet-auth flow (`POST /auth/wallet/challenge` → `POST /auth/wallet/verify`).

```
socket.connect({
  auth: { token: '<access_token>' }
});
```

Connections without a valid JWT are disconnected immediately after the
handshake — before the socket can join any room or emit any event.

The token payload carries:
- `sub` — the internal user id
- `address` — the Stellar wallet address (present for wallet-auth users)

The server **never** trusts identity from the message body.  `playerId` fields
in `room:join` or other payloads are ignored; the authenticated `sub`/`address`
from the JWT are used exclusively.

### Players vs Spectators

On `room:join` the server queries `chain_round_player` (populated by the
indexer from on-chain `RoundJoined` events) to decide the socket's role:

| Role | Condition | Receives broadcasts | May emit gameplay events |
|------|-----------|---------------------|--------------------------|
| **player** | address / userId in `chain_round_player` for the round | ✓ | ✓ |
| **spectator** | not in `chain_round_player` | ✓ | ✗ |

A spectator socket joins the Socket.IO room and receives all broadcasts but
any gameplay event it emits (`room:ready`, `answer:submitted`) is rejected
with `{ success: false, error: '...' }`.  The role is returned in the
`room:join` response:

```
{ success: true, role: 'player' | 'spectator', roomState: RoomState }
```

### Server-only events

`score:update` and `round:completed` are **server → client only**.  The
server registers no `@SubscribeMessage` handler for these names; a client
frame with either name is silently dropped by Socket.IO.  Scores and results
are derived exclusively from indexed on-chain events (`RoundCompleted`).

### Rate limiting

Each authenticated socket is limited to **60 messages per 10-second window**
across all event types.  Exceeding the limit closes the specific message with
a `rate limit exceeded` error; the connection is not terminated.

---

## Client → Server Messages

### Room Management

#### `room:join`
Request entry to a round room.  The `roomId` must match the on-chain round id.

```typescript
socket.emit('room:join', {
  roomId: string;   // On-chain round id
});

// Response:
// { success: true, role: 'player' | 'spectator', roomState: RoomState }
// { success: false, error: string }
```

> `playerId` fields in the payload are **ignored** — identity comes from the JWT.

#### `room:leave`
Leave the room.  Automatically called on disconnect.

```typescript
socket.emit('room:leave', { roomId: string });
// Response: { success: true }
```

#### `room:ready`
Signal readiness to start the round.  **Players only.**

```typescript
socket.emit('room:ready', { roomId: string });
// Response: { success: true } | { success: false, error: 'You must join this room as a player first' }
```

### Gameplay

#### `answer:submitted`
Notify the server that the player submitted an answer on-chain.  **Players only.**
The server relays this for UI updates; it does **not** update scores.

```typescript
socket.emit('answer:submitted', {
  roomId: string;
  answer: string;           // On-chain transaction hash or answer identifier
  roundIndex?: number;
});
// Response: { success: true } | { success: false, error: 'Not a player in this room' }
```

---

## Server → Client Messages (Events)

All server events are scoped to the room.  Clients only receive events for
rooms they have joined.

### Room State

#### `room:state`
Complete room state.  Sent on join and after significant state changes.

```typescript
{
  roomId: string;
  status: 'waiting' | 'starting' | 'playing' | 'completed';
  players: Player[];
  currentRoundIndex: number;
  maxRounds: number;
  createdAt: ISO8601;
}
```

```typescript
Player {
  playerId: string;   // JWT sub (internal user id)
  username: string;   // Wallet address or display name
  isReady: boolean;
  score: number;
  joinedAt: ISO8601;
}
```

### Player Events

#### `player:joined`
A verified player joined the room.  Not emitted for spectators.

```typescript
{ playerId: string; username: string; playerCount: number; timestamp: ISO8601 }
```

#### `player:left`
A player left the room.

```typescript
{ playerId: string; username: string; playerCount: number; timestamp: ISO8601 }
```

#### `player:ready`
A player signalled readiness.

```typescript
{ playerId: string; readyCount: number; totalPlayers: number }
```

### Gameplay Events

#### `card:next`
A new lyric card is presented.  Emitted when the indexer sees `RoundStarted`.

```typescript
{
  roundIndex: number;
  question: {
    id: string;
    lyrics: string;
    options: string[];
    timeLimit: number;    // milliseconds
  };
  timestamp: ISO8601;
}
```

#### `timer:tick`
Periodic timer update (1 Hz or on request via `room:sync`).

```typescript
{ roundIndex: number; remainingMs: number; timestamp: ISO8601 }
```

#### `score:update`
**Server-only.**  Scores derived from indexed `RoundCompleted` on-chain event.
Clients must never emit this; frames with this name from clients are dropped.

```typescript
{ playerId: string; score: number; pointsGained: number; timestamp: ISO8601 }
```

#### `round:completed`
**Server-only.**  Emitted when the indexer processes a `RoundCompleted` event.
Clients must never emit this; frames with this name from clients are dropped.

```typescript
{
  roundIndex: number;
  correctAnswer: string;
  playerResults: {
    playerId: string;
    answer: string;
    isCorrect: boolean;
    pointsEarned: number;
  }[];
  timestamp: ISO8601;
}
```

### System Events

#### `error`
An error occurred.

```typescript
{ code: string; message: string; timestamp: ISO8601 }
```

Error codes:
- `UNAUTHORIZED` — missing or invalid JWT
- `NOT_A_PLAYER` — gameplay event from a spectator
- `ROOM_NOT_FOUND` — referenced room does not exist
- `RATE_LIMIT_EXCEEDED` — too many messages

#### `disconnect`
Server is closing the connection.

```typescript
{ reason: string; message: string }
```

---

## Event Source of Truth

| Event | Source | Gateway action |
|-------|--------|----------------|
| `RoundCreated` | On-chain (indexer) | Initialises room |
| `RoundStarted` | On-chain (indexer) | Broadcasts `card:next` |
| `AnswerSubmitted` | On-chain (indexer) | Relays `answer:submitted` |
| `RoundCompleted` | On-chain (indexer) | Broadcasts `score:update` + `round:completed` |
| `NftMinted` | On-chain (indexer) | Achievement unlock notification |
| `player:joined` / `player:left` | Server (socket lifecycle) | Real-time lobby updates |
| `player:ready` | Client → server relay | Waiting-room readiness |

---

## Connection Lifecycle

```
Client → socket.connect({ auth: { token } })
   ↓
Server: validate JWT → set socket.data.userId / address
   │  failure → emit error{UNAUTHORIZED} → disconnect
   ↓
Client → room:join { roomId }
   ↓
Server: query chain_round_player → role = player | spectator
   ↓  player: broadcast player:joined, add to playerRooms
   ↓  spectator: silent join, add to spectatorRooms
   ↓
[Gameplay]
   player  → answer:submitted   → server relays (no server scoring)
   indexer → RoundCompleted     → server emits score:update + round:completed
   ↓
Client → room:leave  |  disconnect
   ↓
Server: broadcast player:left (players only), clean up
```

---

## Error Handling

- **Invalid JWT** — socket disconnected immediately on connect
- **Gameplay event from spectator** — `{ success: false, error: '...' }` returned to emitter; not broadcast
- **Room not found** — `{ success: false, error: 'Room not found' }`
- **Rate limit exceeded** — message rejected, connection kept
- **RPC / indexer outage** — `score:update` / `round:completed` delayed until recovery

---

## Configuration

**Environment Variables** (backend `.env`):

```
CORS_ORIGINS=http://localhost:3001,https://lyricsflip.example.com
```

**Socket.IO Adapter Settings** (`config/socket-io.config.ts`):

- `pingInterval`: 10 000 ms
- `pingTimeout`: 5 000 ms
- `connectTimeout`: 45 000 ms
- `maxHttpBufferSize`: 100 KB (default)
- `transports`: `['websocket', 'polling']`

---

## Testing

1. **Unit** — `ws-jwt-auth.guard.spec.ts`: guard rejects unauthenticated sockets
2. **Contract** — `game/realtime-protocol.contract.spec.ts`: non-player cannot emit
   gameplay events; `score:update` / `round:completed` have no client handler;
   identity always comes from JWT
3. **Integration** (future) — two Socket.IO clients, live DB, verify room isolation

---

## References

- Issue #925 (LF-339): Authenticate the game socket and check room membership
- Issue #508 (LF-091): Real-time multiplayer protocol
- Issue #505 (LF-088): On-chain event indexer
