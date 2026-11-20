import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  Keypair,
  nativeToScVal,
  scValToNative,
  rpc as SorobanRpc,
  TransactionBuilder,
  Account,
  Networks,
  xdr,
} from '@stellar/stellar-sdk';
import { DataSource, EntityManager } from 'typeorm';
import { CreateStateRecoveryDto } from './dto/create-state-recovery.dto';
import { UpdateStateRecoveryDto } from './dto/update-state-recovery.dto';

export interface BackfillResult {
  contractId: string;
  rounds: number;
  roundResults: number;
  playerStats: number;
  fromLedger: number;
  toLedger: number;
}

export interface CursorResetResult {
  previousCursor: string | null;
  newCursor: string;
  earliestRetainedLedger: number;
  latestLedger: number;
}

@Injectable()
export class StateRecoveryService {
  private readonly logger = new Logger(StateRecoveryService.name);
  private readonly rpc: SorobanRpc.Server;
  private readonly networkPassphrase: string;
  private readonly sourceKeypair: Keypair;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    const rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ??
      'https://soroban-testnet.stellar.org';
    this.rpc = new SorobanRpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });

    this.networkPassphrase =
      this.configService.get<string>('STELLAR_NETWORK_PASSPHRASE') ??
      Networks.TESTNET;

    const secret =
      this.configService.get<string>('INDEXER_SOURCE_SECRET') ??
      this.configService.get<string>('STELLAR_SOURCE_SECRET');
    if (secret) {
      this.sourceKeypair = Keypair.fromSecret(secret);
    } else {
      // Read-only simulation does not require a funded account; a random
      // keypair is sufficient to build the transaction envelope.
      this.sourceKeypair = Keypair.random();
    }
  }

  create(createStateRecoveryDto: CreateStateRecoveryDto) {
    return 'This action adds a new stateRecovery';
  }

  findAll() {
    return `This action returns all stateRecovery`;
  }

  findOne(id: number) {
    return `This action returns a #${id} stateRecovery`;
  }

  update(id: number, updateStateRecoveryDto: UpdateStateRecoveryDto) {
    return `This action updates a #${id} stateRecovery`;
  }

  remove(id: number) {
    return `This action removes a #${id} stateRecovery`;
  }

  /**
   * LF-223: State backfill.
   *
   * Reads the authoritative contract state directly via Soroban RPC
   * `simulateTransaction` (read-only invocation of `get_rounds`,
   * `get_round_results`, and `get_player_stat`) and reconciles the indexer
   * tables inside a single database transaction.
   *
   * This is the fallback used when the event-retention window has been
   * exceeded and the saved cursor is no longer valid.
   */
  async backfillFromContract(contractId: string): Promise<BackfillResult> {
    if (!contractId) {
      throw new Error('backfillFromContract: contractId is required');
    }

    const contract = new Contract(contractId);

    const [roundsRaw, roundResultsRaw, playerStatsRaw] = await Promise.all([
      this.simulateRead(contract, 'get_rounds', []),
      this.simulateRead(contract, 'get_round_results', []),
      this.simulateRead(contract, 'get_player_stat', []),
    ]);

    const rounds = this.normalizeCollection(roundsRaw);
    const roundResults = this.normalizeCollection(roundResultsRaw);
    const playerStats = this.normalizeCollection(playerStatsRaw);

    const latest = await this.rpc.getLatestLedger();
    const earliestRetainedLedger = this.computeEarliestRetainedLedger(
      latest.sequence,
    );

    const result: BackfillResult = {
      contractId,
      rounds: rounds.length,
      roundResults: roundResults.length,
      playerStats: playerStats.length,
      fromLedger: earliestRetainedLedger,
      toLedger: latest.sequence,
    };

    await this.dataSource.transaction(async (manager: EntityManager) => {
      await this.upsertRounds(manager, rounds);
      await this.upsertRoundResults(manager, roundResults);
      await this.upsertRoundPlayers(manager, playerStats);
      await this.upsertLeaderboardRoundResults(manager, roundResults);
    });

    this.logger.log(
      `State backfill complete for ${contractId}: ` +
        `${result.rounds} rounds, ${result.roundResults} round results, ` +
        `${result.playerStats} player stats (ledgers ${result.fromLedger}-${result.toLedger})`,
    );

    return result;
  }

  /**
   * LF-223: Reset the indexer cursor to the earliest ledger the RPC still
   * retains. Called after a retention gap is detected so the indexer can
   * resume streaming events from a valid position.
   */
  async resetCursorToEarliestRetainedLedger(): Promise<CursorResetResult> {
    const latest = await this.rpc.getLatestLedger();
    const earliestRetainedLedger = this.computeEarliestRetainedLedger(
      latest.sequence,
    );
    const newCursor = String(earliestRetainedLedger);

    let previousCursor: string | null = null;
    try {
      const rows: Array<{ cursor: string | null }> =
        await this.dataSource.query(
          `SELECT cursor FROM indexer_cursor WHERE id = 1`,
        );
      if (rows.length > 0) {
        previousCursor = rows[0].cursor ?? null;
      }
    } catch (err) {
      this.logger.warn(
        `Unable to read previous indexer cursor: ${(err as Error).message}`,
      );
    }

    await this.dataSource.query(
      `INSERT INTO indexer_cursor (id, cursor, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = NOW()`,
      [newCursor],
    );

    this.logger.warn(
      `Indexer cursor reset from ${previousCursor ?? '<none>'} to ${newCursor} ` +
        `(earliest retained ledger ${earliestRetainedLedger}, latest ${latest.sequence})`,
    );

    return {
      previousCursor,
      newCursor,
      earliestRetainedLedger,
      latestLedger: latest.sequence,
    };
  }

  /**
   * Computes the earliest ledger still retained by the RPC based on the
   * configured retention window (defaults to 7 days ~= 120,960 ledgers at
   * ~5s per ledger).
   */
  private computeEarliestRetainedLedger(latestLedger: number): number {
    const retentionLedgers = Number(
      this.configService.get<string>('SOROBAN_EVENT_RETENTION_LEDGERS') ??
        '120960',
    );
    return Math.max(1, latestLedger - retentionLedgers);
  }

  /**
   * Performs a read-only contract invocation via `simulateTransaction` and
   * decodes the returned value with `scValToNative`.
   */
  private async simulateRead(
    contract: Contract,
    method: string,
    args: xdr.ScVal[],
  ): Promise<unknown> {
    const account = new Account(this.sourceKeypair.publicKey(), '0');
    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const simulation = await this.rpc.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simulation)) {
      throw new Error(
        `simulateTransaction(${method}) failed: ${simulation.error}`,
      );
    }

    const results = (
      simulation as SorobanRpc.Api.SimulateTransactionSuccessResponse
    ).result;
    if (!results || !results.retval) {
      return null;
    }

    return scValToNative(results.retval);
  }

  /**
   * Normalizes a decoded contract collection into an array of records.
   * Handles maps, arrays, and single-object responses.
   */
  private normalizeCollection(value: unknown): Record<string, unknown>[] {
    if (value == null) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.toRecord(item));
    }
    if (value instanceof Map) {
      // A map keyed by id -> record.
      return Array.from(value.values()).map((item) => this.toRecord(item));
    }
    if (typeof value === 'object') {
      return [this.toRecord(value)];
    }
    return [];
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (value instanceof Map) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of value.entries()) {
        obj[String(k)] = v;
      }
      return obj;
    }
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return { value };
  }

  private pick(record: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null) {
        return record[key];
      }
    }
    return undefined;
  }

  private toNumber(value: unknown): number | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }

  private toStringOrNull(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    return String(value);
  }

  private async upsertRounds(
    manager: EntityManager,
    rounds: Record<string, unknown>[],
  ): Promise<void> {
    for (const round of rounds) {
      const roundId = this.toNumber(
        this.pick(round, 'round_id', 'roundId', 'id'),
      );
      if (roundId === null) {
        continue;
      }
      await manager.query(
        `INSERT INTO chain_rounds
           (round_id, state, start_ledger, end_ledger, player_count, total_prize, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (round_id) DO UPDATE SET
           state = EXCLUDED.state,
           start_ledger = EXCLUDED.start_ledger,
           end_ledger = EXCLUDED.end_ledger,
           player_count = EXCLUDED.player_count,
           total_prize = EXCLUDED.total_prize,
           updated_at = NOW()`,
        [
          roundId,
          this.toStringOrNull(this.pick(round, 'state', 'status')),
          this.toNumber(this.pick(round, 'start_ledger', 'startLedger')),
          this.toNumber(this.pick(round, 'end_ledger', 'endLedger')),
          this.toNumber(this.pick(round, 'player_count', 'playerCount')),
          this.toStringOrNull(
            this.pick(round, 'total_prize', 'totalPrize', 'prize'),
          ),
        ],
      );
    }
  }

  private async upsertRoundResults(
    manager: EntityManager,
    roundResults: Record<string, unknown>[],
  ): Promise<void> {
    for (const result of roundResults) {
      const roundId = this.toNumber(
        this.pick(result, 'round_id', 'roundId', 'id'),
      );
      if (roundId === null) {
        continue;
      }
      await manager.query(
        `INSERT INTO chain_round_results
           (round_id, winner, winning_answer, resolved_ledger, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (round_id) DO UPDATE SET
           winner = EXCLUDED.winner,
           winning_answer = EXCLUDED.winning_answer,
           resolved_ledger = EXCLUDED.resolved_ledger,
           updated_at = NOW()`,
        [
          roundId,
          this.toStringOrNull(this.pick(result, 'winner', 'winner_address')),
          this.toStringOrNull(
            this.pick(result, 'winning_answer', 'winningAnswer', 'answer'),
          ),
          this.toNumber(
            this.pick(result, 'resolved_ledger', 'resolvedLedger', 'ledger'),
          ),
        ],
      );
    }
  }

  private async upsertRoundPlayers(
    manager: EntityManager,
    playerStats: Record<string, unknown>[],
  ): Promise<void> {
    for (const stat of playerStats) {
      const player = this.toStringOrNull(
        this.pick(stat, 'player', 'player_address', 'address', 'account'),
      );
      const roundId = this.toNumber(
        this.pick(stat, 'round_id', 'roundId', 'id'),
      );
      if (!player || roundId === null) {
        continue;
      }
      await manager.query(
        `INSERT INTO chain_round_players
           (round_id, player, score, correct_answers, is_winner, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (round_id, player) DO UPDATE SET
           score = EXCLUDED.score,
           correct_answers = EXCLUDED.correct_answers,
           is_winner = EXCLUDED.is_winner,
           updated_at = NOW()`,
        [
          roundId,
          player,
          this.toNumber(this.pick(stat, 'score', 'points')),
          this.toNumber(
            this.pick(stat, 'correct_answers', 'correctAnswers', 'correct'),
          ),
          Boolean(this.pick(stat, 'is_winner', 'isWinner', 'winner')),
        ],
      );
    }
  }

  private async upsertLeaderboardRoundResults(
    manager: EntityManager,
    roundResults: Record<string, unknown>[],
  ): Promise<void> {
    for (const result of roundResults) {
      const roundId = this.toNumber(
        this.pick(result, 'round_id', 'roundId', 'id'),
      );
      if (roundId === null) {
        continue;
      }
      const winner = this.toStringOrNull(
        this.pick(result, 'winner', 'winner_address'),
      );
      const score = this.toNumber(
        this.pick(result, 'score', 'winning_score', 'winningScore'),
      );
      if (!winner) {
        continue;
      }
      await manager.query(
        `INSERT INTO leaderboard_round_results
           (round_id, player, score, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (round_id, player) DO UPDATE SET
           score = EXCLUDED.score,
           updated_at = NOW()`,
        [roundId, winner, score],
      );
    }
  }
}
