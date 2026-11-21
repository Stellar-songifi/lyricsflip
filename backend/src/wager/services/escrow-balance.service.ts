import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  Keypair,
  Account,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';

/**
 * Network passphrases keyed by the `STELLAR_NETWORK` value. Used when
 * `STELLAR_NETWORK_PASSPHRASE` is not set explicitly.
 */
const NETWORK_PASSPHRASES: Record<string, string> = {
  testnet: 'Test SDF Network ; September 2015',
  futurenet: 'Test SDF Future Network ; October 2022',
  mainnet: 'Public Global Stellar Network ; September 2015',
};

/**
 * LF-340: Reads the escrow contract's on-chain token balance so the nightly
 * reconciliation job can compare it against the database's open-pot sum.
 *
 * The escrow contract holds SEP-41 tokens. To read the balance we simulate a
 * `balance(Address)` call on the token contract — no signing or funded
 * account is required because `simulateTransaction` is read-only.
 */
@Injectable()
export class EscrowBalanceService {
  private readonly logger = new Logger(EscrowBalanceService.name);

  constructor(private readonly configService: ConfigService) {}

  private resolveRpcUrl(): string | undefined {
    return (
      this.configService.get<string>('soroban.rpcUrl') ??
      process.env.SOROBAN_RPC_URL ??
      process.env.STELLAR_RPC_URL
    );
  }

  private resolveNetworkPassphrase(): string | undefined {
    const explicit = this.configService.get<string>('stellar.networkPassphrase');
    if (explicit) return explicit;
    const network = this.configService.get<string>('stellar.network');
    return network ? NETWORK_PASSPHRASES[network] : undefined;
  }

  /**
   * Returns the escrow contract's balance for a single SEP-41 token, in
   * base units (stroops). Returns `null` when the RPC or contract is not
   * configured, or when the simulation fails — callers should treat `null`
   * as "unknown" and skip reconciliation for that asset.
   */
  async getTokenBalance(
    tokenContractId: string,
    escrowContractId: string,
  ): Promise<string | null> {
    const rpcUrl = this.resolveRpcUrl();
    const passphrase = this.resolveNetworkPassphrase();

    if (!rpcUrl || !passphrase) {
      this.logger.warn(
        'Cannot query escrow balance: RPC URL or network passphrase not configured.',
      );
      return null;
    }

    try {
      const server = new rpc.Server(rpcUrl, {
        allowHttp: rpcUrl.startsWith('http://'),
      });

      // Build a read-only `balance(Address)` contract call. The source
      // account does not need to exist on-chain — simulation only reads
      // contract state.
      const sourceKeypair = Keypair.random();
      const sourceAccount = new Account(sourceKeypair.publicKey(), '0');

      const op = Operation.invokeContractFunction({
        contract: tokenContractId,
        function: 'balance',
        args: [new Address(escrowContractId).toScVal()],
      });

      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: passphrase,
      })
        .addOperation(op)
        .setTimeout(30)
        .build();

      const simulation = await server.simulateTransaction(tx);

      if (rpc.Api.isSimulationError(simulation)) {
        this.logger.warn(
          `Escrow balance simulation failed for ${tokenContractId}: ${
            (simulation as rpc.Api.SimulateTransactionErrorResponse).error
          }`,
        );
        return null;
      }

      const retval = (simulation as rpc.Api.SimulateTransactionSuccessResponse)
        .result?.retval;
      if (!retval) {
        this.logger.warn('Escrow balance simulation returned no value.');
        return null;
      }

      const balance = scValToNative(retval);
      return BigInt(balance).toString();
    } catch (err) {
      this.logger.warn(
        `Failed to query escrow token balance for ${tokenContractId}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
