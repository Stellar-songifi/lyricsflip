#!/usr/bin/env bash
# LF-365: health-check the contract IDs recorded in deployments/testnet.json.
#
# Uses getLedgerEntries on each contract's instance entry (the same check the
# frontend banner performs) and exposes two outputs to the calling step:
#   missing      - a recorded instance is gone (i.e. a testnet reset happened)
#   needs_deploy - IDs are incomplete or missing, so a fresh deploy is needed
#
# Required env: DEPLOYMENT_FILE (defaults to deployments/testnet.json).

set -euo pipefail

DEPLOYMENT_FILE="${DEPLOYMENT_FILE:-deployments/testnet.json}"
RPC_URL="$(jq -r '.rpcUrl // "https://soroban-testnet.stellar.org"' "$DEPLOYMENT_FILE")"
GAME_ID="$(jq -r '.lyricsflip // ""' "$DEPLOYMENT_FILE")"
NFT_ID="$(jq -r '.lyricsflipNft // ""' "$DEPLOYMENT_FILE")"

IDS=()
[[ -n "$GAME_ID" ]] && IDS+=("$GAME_ID")
[[ -n "$NFT_ID" ]] && IDS+=("$NFT_ID")

MISSING=false
if ((${#IDS[@]} > 0)); then
  # A throwaway prefix keeps this independent of the repo's (large) workspaces
  # and of any package manager state in the checkout.
  CHECK_DIR="${RUNNER_TEMP:-/tmp}/lyricsflip-contract-check"
  mkdir -p "$CHECK_DIR"
  npm install --prefix "$CHECK_DIR" --no-save --no-package-lock --no-audit --no-fund \
    '@stellar/stellar-sdk@^17.0.1' >/dev/null
  RESULT="$(NODE_PATH="$CHECK_DIR/node_modules" \
    node .github/scripts/check-contract-instances.cjs "$RPC_URL" "${IDS[@]}")"
  echo "$RESULT"
  grep -q ' missing$' <<<"$RESULT" && MISSING=true || true
else
  echo "No recorded contract IDs in $DEPLOYMENT_FILE; nothing to verify."
fi

NEEDS_DEPLOY=false
if ((${#IDS[@]} < 2)) || [[ "$MISSING" == true ]]; then
  NEEDS_DEPLOY=true
fi

echo "missing=$MISSING"
echo "needs_deploy=$NEEDS_DEPLOY"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "missing=$MISSING"
    echo "needs_deploy=$NEEDS_DEPLOY"
  } >>"$GITHUB_OUTPUT"
fi
