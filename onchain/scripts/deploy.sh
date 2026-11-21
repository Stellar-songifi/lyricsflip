#!/usr/bin/env bash
# deploy.sh — build, deploy, and configure both LyricsFlip contracts on a
# target Stellar network, then write the contract IDs to
# frontend/.env.local.
#
# Usage:
#   ./scripts/deploy.sh [network]   (default: testnet)
#
# Supported networks: testnet, futurenet, mainnet, local.
#   • local  — the Stellar quickstart node started by `make dev`
#              (RPC http://localhost:8000/soroban/rpc, passphrase
#              "Standalone Network ; February 2017").
#
# Prerequisites:
#   • Stellar CLI installed (https://developers.stellar.org/docs/tools/stellar-cli)
#   • A funded identity called "me" on the target network:
#       stellar keys generate --global me --network <network> --fund
#     (for `local`, fund it with:
#       curl "http://localhost:8000/friendbot?addr=$(stellar keys address me)")
#   • Rust toolchain with the wasm32v1-none target:
#       rustup target add wasm32v1-none
#
# After a successful run the following files are written / updated:
#   • frontend/.env.local   NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID,
#                           NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID and, for
#                           `local`, the RPC URL / network passphrase.
#   • deployments/<network>.json  contract IDs and WASM SHA-256 hashes.

set -euo pipefail

NETWORK="${1:-testnet}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONCHAIN_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${ONCHAIN_DIR}/.." && pwd)"
FRONTEND_ENV="${REPO_ROOT}/frontend/.env.local"

IDENTITY="me"
CARDS_PER_ROUND=5

LOCAL_RPC_URL="http://localhost:8000/soroban/rpc"
LOCAL_PASSPHRASE="Standalone Network ; February 2017"

log() { echo "[deploy.sh] $*"; }

# ---------------------------------------------------------------------------
# 0. Network configuration
# ---------------------------------------------------------------------------
# Extra flags passed to every `stellar` invocation that talks to the network.
NETWORK_FLAGS=()
RPC_URL=""
NETWORK_PASSPHRASE=""

case "${NETWORK}" in
  local)
    RPC_URL="${LOCAL_RPC_URL}"
    NETWORK_PASSPHRASE="${LOCAL_PASSPHRASE}"
    # Register (or refresh) the local network in the CLI config so that
    # `--network local` resolves to the quickstart node.
    if ! stellar network ls 2>/dev/null | grep -qx "local"; then
      stellar network add local \
        --rpc-url "${RPC_URL}" \
        --network-passphrase "${NETWORK_PASSPHRASE}" >/dev/null
    fi
    NETWORK_FLAGS=(--rpc-url "${RPC_URL}" --network-passphrase "${NETWORK_PASSPHRASE}")
    ;;
  testnet|futurenet|mainnet)
    ;;
  *)
    echo "ERROR: unsupported network '${NETWORK}' (expected testnet, futurenet, mainnet or local)."
    exit 1
    ;;
esac

# Run a stellar command against the target network.
stellar_net() {
  if [[ ${#NETWORK_FLAGS[@]} -gt 0 ]]; then
    stellar "$@" "${NETWORK_FLAGS[@]}"
  else
    stellar "$@" --network "${NETWORK}"
  fi
}

# ---------------------------------------------------------------------------
# 1. Build WASM
# ---------------------------------------------------------------------------
log "Building contracts for wasm32v1-none…"
(
  cd "${ONCHAIN_DIR}"
  cargo build --target wasm32v1-none --release 2>&1
)

LYRICSFLIP_WASM="${ONCHAIN_DIR}/target/wasm32v1-none/release/lyricsflip.wasm"
ESCROW_WASM="${ONCHAIN_DIR}/target/wasm32v1-none/release/lyricsflip_escrow.wasm"
NFT_WASM="${ONCHAIN_DIR}/target/wasm32v1-none/release/lyricsflip_nft.wasm"

if [[ ! -f "${LYRICSFLIP_WASM}" ]]; then
  echo "ERROR: lyricsflip.wasm not found after build."; exit 1
fi
if [[ ! -f "${ESCROW_WASM}" ]]; then
  echo "ERROR: lyricsflip-escrow.wasm not found after build."; exit 1
fi
if [[ ! -f "${NFT_WASM}" ]]; then
  echo "ERROR: lyricsflip_nft.wasm not found after build."; exit 1
fi

OWNER_ADDRESS="$(stellar keys address "${IDENTITY}")"
log "Deploying as ${OWNER_ADDRESS} on ${NETWORK}…"

# Record SHA-256 hashes of the build artifacts (used by the deploy workflow).
sha256_of() {
  if command -v sha256sum &>/dev/null; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}
LYRICSFLIP_WASM_SHA="$(sha256_of "${LYRICSFLIP_WASM}")"
NFT_WASM_SHA="$(sha256_of "${NFT_WASM}")"
log "Game WASM sha256: ${LYRICSFLIP_WASM_SHA}"
log "NFT  WASM sha256: ${NFT_WASM_SHA}"

# ---------------------------------------------------------------------------
# 2. Deploy game contract
# ---------------------------------------------------------------------------
log "Deploying lyricsflip game contract…"
LYRICSFLIP_CONTRACT_ID="$(stellar_net contract deploy \
  --wasm "${LYRICSFLIP_WASM}" \
  --source "${IDENTITY}" \
  -- --owner "${OWNER_ADDRESS}")"

log "Game contract deployed: ${LYRICSFLIP_CONTRACT_ID}"

# ---------------------------------------------------------------------------
# 3. Deploy NFT contract  (minter = game contract)
# ---------------------------------------------------------------------------
log "Deploying lyricsflip-nft contract…"
NFT_CONTRACT_ID="$(stellar_net contract deploy \
  --wasm "${NFT_WASM}" \
  --source "${IDENTITY}" \
  -- \
  --owner "${OWNER_ADDRESS}" \
  --minter "${LYRICSFLIP_CONTRACT_ID}" \
  --token_name "LyricsFlip" \
  --token_symbol "LFLIP" \
  --base_uri "https://lyricsflip.xyz/nft/")"

log "NFT contract deployed: ${NFT_CONTRACT_ID}"

# ---------------------------------------------------------------------------
# 4. Configure the game contract
# ---------------------------------------------------------------------------
log "Setting cards_per_round to ${CARDS_PER_ROUND}…"
stellar_net contract invoke \
  --id "${LYRICSFLIP_CONTRACT_ID}" \
  --source "${IDENTITY}" \
  -- set_cards_per_round \
  --caller "${OWNER_ADDRESS}" \
  --value "${CARDS_PER_ROUND}"

# ---------------------------------------------------------------------------
# 5. Write .env.local
# ---------------------------------------------------------------------------
log "Writing contract IDs to ${FRONTEND_ENV}…"

# If .env.local does not exist, initialize from .env.example
if [[ ! -f "${FRONTEND_ENV}" && -f "${REPO_ROOT}/frontend/.env.example" ]]; then
  cp "${REPO_ROOT}/frontend/.env.example" "${FRONTEND_ENV}"
fi

# Preserve any existing variables that are NOT managed by this script.
KEEP_LINES=""
if [[ -f "${FRONTEND_ENV}" ]]; then
  KEEP_LINES="$(grep -v '^NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID' "${FRONTEND_ENV}" \
                | grep -v '^NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID' \
                | grep -v '^NEXT_PUBLIC_SOROBAN_RPC_URL' \
                | grep -v '^NEXT_PUBLIC_NETWORK_PASSPHRASE' || true)"
fi

{
  if [[ -n "${KEEP_LINES}" ]]; then
    echo "${KEEP_LINES}"
  fi
  echo "NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID=${LYRICSFLIP_CONTRACT_ID}"
  echo "NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID=${NFT_CONTRACT_ID}"
  echo "NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID=${ESCROW_CONTRACT_ID}"
  if [[ -n "${RPC_URL}" ]]; then
    echo "NEXT_PUBLIC_SOROBAN_RPC_URL=${RPC_URL}"
    echo "NEXT_PUBLIC_NETWORK_PASSPHRASE=${NETWORK_PASSPHRASE}"
  fi
} > "${FRONTEND_ENV}"

# Update deployment file defaults if present
DEPLOYMENT_FILE="${REPO_ROOT}/deployments/${NETWORK}.json"
if [[ -f "${DEPLOYMENT_FILE}" ]] && command -v jq &>/dev/null; then
  log "Updating ${DEPLOYMENT_FILE}…"
  jq --arg g "${LYRICSFLIP_CONTRACT_ID}" \
     --arg n "${NFT_CONTRACT_ID}" \
     --arg d "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     --arg gs "${LYRICSFLIP_WASM_SHA}" \
     --arg ns "${NFT_WASM_SHA}" \
     '.lyricsflip = $g | .lyricsflipNft = $n | .deployedAt = $d
      | .wasm = ((.wasm // {}) + {lyricsflip: $gs, lyricsflipNft: $ns})' \
     "${DEPLOYMENT_FILE}" > "${DEPLOYMENT_FILE}.tmp" && mv "${DEPLOYMENT_FILE}.tmp" "${DEPLOYMENT_FILE}"
fi

log "Done!"
log "  Game contract : ${LYRICSFLIP_CONTRACT_ID}"
log "  NFT  contract : ${NFT_CONTRACT_ID}"
log ""
log "Run './scripts/seed-cards.sh ${NETWORK}' to populate the card catalogue."
if [[ "${NETWORK}" == "local" ]]; then
  log "Local RPC: ${RPC_URL}"
  log "Then start the frontend: cd ${REPO_ROOT}/frontend && npm run dev"
else
  log "Then start the frontend: cd ${REPO_ROOT}/frontend && npm run dev"
fi
