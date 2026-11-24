#!/usr/bin/env node
/**
 * LF-365: check whether Soroban contract instances still exist on a network.
 *
 * Usage:
 *   node check-contract-instances.cjs <rpc-url> <contract-id> [contract-id ...]
 *
 * Prints "<contract-id> present|missing" for every id and exits 2 when the
 * RPC call itself fails, so callers never mistake an RPC outage for a reset.
 */
const { Address, rpc, xdr } = require('@stellar/stellar-sdk');

/** Ledger key for a contract's `ContractInstance` entry. */
function instanceKey(contractId) {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

async function main() {
  const [rpcUrl, ...contractIds] = process.argv.slice(2);
  if (!rpcUrl || contractIds.length === 0) {
    console.error('usage: check-contract-instances.cjs <rpc-url> <contract-id> [contract-id ...]');
    process.exit(2);
  }

  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const keys = contractIds.map(instanceKey);
  const { entries } = await server.getLedgerEntries(...keys);
  const presentKeys = new Set(entries.map((entry) => entry.key.toXDR('base64')));

  contractIds.forEach((contractId, index) => {
    const present = presentKeys.has(keys[index].toXDR('base64'));
    console.log(`${contractId} ${present ? 'present' : 'missing'}`);
  });
}

main().catch((error) => {
  console.error(`getLedgerEntries failed: ${error?.message ?? error}`);
  process.exit(2);
});
