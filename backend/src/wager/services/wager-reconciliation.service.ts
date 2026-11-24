import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WagerService } from '../provider/wager.service';
import { EscrowBalanceService } from './escrow-balance.service';
import { ReconciliationResultDto } from '../dto/reconciliation-result.dto';

/**
 * LF-340: Nightly job that reconciles the database's open-pot sum with the
 * escrow contract's actual on-chain token balance.
 *
 * - Sums every escrowed wager's amount from the `wagers` table (grouped by
 *   asset) — this is what the DB *thinks* the contract holds.
 * - Reads the escrow contract's real token balance from the chain via
 *   EscrowBalanceService.
 * - Alerts (logs WARN + stores the mismatch) when the two diverge beyond a
 *   configurable tolerance.
 *
 * The result is cached in memory and exposed via the monitoring endpoint
 * `GET /wagers/reconciliation-status`.
 */
@Injectable()
export class WagerReconciliationService {
  private readonly logger = new Logger(WagerReconciliationService.name);

  /** Last reconciliation result, served to the monitoring panel. */
  private lastResult: ReconciliationResultDto | null = null;

  /**
   * Tolerance in base units. Wager amounts are i128 stroops; small rounding
   * from fee deductions or dust can cause a sub-stroop delta that is not a
   * real discrepancy. Configurable via WAGER_RECONCILIATION_TOLERANCE.
   */
  private readonly tolerance: bigint;

  constructor(
    private readonly wagerService: WagerService,
    private readonly escrowBalanceService: EscrowBalanceService,
    private readonly configService: ConfigService,
  ) {
    const toleranceStr =
      this.configService.get<string>('wager.reconciliationTolerance') ??
      '0';
    this.tolerance = BigInt(toleranceStr);
  }

  /**
   * Runs every night at midnight (server local time).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async reconcile(): Promise<ReconciliationResultDto> {
    this.logger.log('Starting nightly wager reconciliation (LF-340).');
    try {
      return await this.runReconciliation();
    } catch (err) {
      this.logger.error(
        `Wager reconciliation failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }

  /**
   * Performs the reconciliation and caches the result. Exposed publicly so
   * the monitoring endpoint can trigger an on-demand check if needed.
   */
  async runReconciliation(): Promise<ReconciliationResultDto> {
    // 1. Sum open pots from the database, grouped by asset.
    const dbEscrowedTotals = await this.wagerService.sumEscrowedAmounts();

    // 2. Read the escrow contract's token balance for each asset.
    const escrowContractId = this.configService.get<string>(
      'soroban.escrowContractId',
    );
    const contractBalances: Record<string, string> = {};
    const differences: Record<string, string> = {};
    let matched = true;
    const alerts: string[] = [];

    if (!escrowContractId) {
      this.logger.warn(
        'Escrow contract ID not configured — skipping on-chain balance check.',
      );
      const result: ReconciliationResultDto = {
        checkedAt: new Date().toISOString(),
        dbEscrowedTotals,
        contractBalances: {},
        differences: {},
        matched: false,
        alert:
          'Escrow contract ID not configured; on-chain balance check skipped.',
      };
      this.lastResult = result;
      return result;
    }

    // Query each asset's token contract for the escrow balance.
    const tokenContractIds = this.resolveTokenContractIds();
    for (const [asset, dbTotalStr] of Object.entries(dbEscrowedTotals)) {
      const tokenContractId = tokenContractIds[asset];
      if (!tokenContractId) {
        this.logger.warn(
          `No token contract ID configured for asset "${asset}" — skipping.`,
        );
        continue;
      }

      const contractBalanceStr = await this.escrowBalanceService.getTokenBalance(
        tokenContractId,
        escrowContractId,
      );

      if (contractBalanceStr === null) {
        this.logger.warn(
          `Could not read escrow balance for asset "${asset}" — skipping.`,
        );
        continue;
      }

      contractBalances[asset] = contractBalanceStr;

      const dbTotal = BigInt(dbTotalStr);
      const contractBalance = BigInt(contractBalanceStr);
      const diff = contractBalance - dbTotal;
      differences[asset] = diff.toString();

      if (this.abs(diff) > this.tolerance) {
        matched = false;
        const msg =
          `Wager reconciliation mismatch for "${asset}": ` +
          `DB escrowed total = ${dbTotalStr}, ` +
          `contract balance = ${contractBalanceStr}, ` +
          `difference = ${diff.toString()} (tolerance ±${this.tolerance.toString()}).`;
        this.logger.warn(msg);
        alerts.push(msg);
      }
    }

    const result: ReconciliationResultDto = {
      checkedAt: new Date().toISOString(),
      dbEscrowedTotals,
      contractBalances,
      differences,
      matched,
      alert: alerts.length > 0 ? alerts.join('\n') : undefined,
    };

    this.lastResult = result;

    if (matched) {
      this.logger.log('Wager reconciliation passed: all balances match.');
    } else {
      this.logger.warn(
        `Wager reconciliation detected ${alerts.length} mismatch(es).`,
      );
    }

    return result;
  }

  /** Returns the most recent reconciliation result, or null if not yet run. */
  getLastResult(): ReconciliationResultDto | null {
    return this.lastResult;
  }

  /**
   * Resolves the mapping from wager asset code to the SEP-41 token contract
   * ID. Currently only the "native" asset is supported, configurable via
   * SOROBAN_NATIVE_TOKEN_CONTRACT_ID. Other assets can be added later.
   */
  private resolveTokenContractIds(): Record<string, string> {
    const nativeTokenId = this.configService.get<string>(
      'soroban.nativeTokenContractId',
    );
    const mapping: Record<string, string> = {};
    if (nativeTokenId) {
      mapping['native'] = nativeTokenId;
    }
    return mapping;
  }

  private abs(value: bigint): bigint {
    return value < 0n ? -value : value;
  }
}
