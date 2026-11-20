# Mainnet Readiness Checklist (LF-250)

This document defines what "ready for mainnet" means for LyricsFlip. Every item must be checked and signed off by maintainers before a mainnet deployment is approved.

## Sign-off

| Item | Owner | Status | Date |
| --- | --- | --- | --- |
| External audit completed | Security | ☐ | |
| P0/P1 issues closed | Eng | ☐ | |
| ADRs accepted | Architecture | ☐ | |
| Owner key in multisig / hardware wallet | DevOps | ☐ | |
| Pause tested | Eng | ☐ | |
| Upgrade & migrate rehearsed on testnet | Eng | ☐ | |
| TTL bump job scheduled | DevOps | ☐ | |
| Lyrics licensing confirmed | Legal | ☐ | |

## Checklist

### 1. External audit done
- [ ] Independent security audit of the contracts is complete.
- [ ] All audit findings are resolved or explicitly accepted with rationale.
- [ ] The audit report is linked from this document.

### 2. P0/P1 issues closed
- [ ] No open P0 or P1 issues remain in the tracker.
- [ ] Any deferred P2 items are documented with owners and target dates.

### 3. ADRs accepted
- [ ] All architecture decision records affecting contracts, escrow, and indexing are in `Accepted` status.
- [ ] Superseded ADRs are marked accordingly.

### 4. Owner key in a multisig or hardware wallet
- [ ] The contract owner/admin key is held by a multisig or hardware wallet — never a hot key.
- [ ] Signer set and threshold are documented.
- [ ] Key rotation procedure is documented in the incident runbook.

### 5. Pause tested
- [ ] The pause entrypoint has been exercised on testnet.
- [ ] Unpause has been exercised on testnet.
- [ ] Pausing halts `submit_answer` and round finalization as expected.

### 6. Upgrade and migrate rehearsed on testnet
- [ ] The upgrade path has been rehearsed end-to-end on testnet.
- [ ] Data migration (if any) has been rehearsed and verified.
- [ ] Rollback of the upgrade has been rehearsed.

### 7. TTL bump job scheduled
- [ ] A scheduled job bumps contract data TTLs before expiry.
- [ ] The job is monitored and alerts on failure (see monitoring config).

### 8. Lyrics licensing confirmed
- [ ] Licensing for all bundled lyrics is confirmed per [`docs/content-policy.md`](./content-policy.md).
- [ ] Any unlicensed content is removed or replaced.

## Related documents

- [Incident runbook](./incident-runbook.md)
- [Content policy](./content-policy.md)
- Monitoring configuration: [`monitoring/`](../monitoring/)
