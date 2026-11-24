#!/usr/bin/env bash
# seed-cards.sh — read seed/songs.json and invoke add_card for each
# entry against the deployed LyricsFlip game contract.
#
# LF-353: This script is now a thin wrapper that delegates to the unified
# seeder (`npm run seed:unified` in the backend) when Node.js and the
# backend dependencies are available. The unified seeder:
#   1. Inserts into the database.
#   2. Checks which cards already exist on-chain (by sha256 fingerprint).
#   3. Pushes only new cards in batches.
#   4. Writes back the on-chain card_id to the database.
# This keeps the database and the chain in sync from a single source.
#
# When Node.js is not available, the script falls back to the original
# direct CLI invocation path (below) so it still works in a pure Rust
# toolchain environment.
#
# Usage:
#   ./scripts/seed-cards.sh [network]   (default: testnet)
#
# Prerequisites:
#   • deploy.sh has already been run (LYRICSFLIP_CONTRACT_ID must be set
#     in the environment or frontend/.env.local).
#   • Stellar CLI installed.
#   • For the unified path: Node.js + backend npm dependencies installed.
#   • A funded identity called "me" on the target network.

set -euo pipefail

NETWORK="${1:-testnet}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONCHAIN_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${ONCHAIN_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"
FRONTEND_ENV="${REPO_ROOT}/frontend/.env.local"
CARDS_JSON="${REPO_ROOT}/seed/songs.json"

IDENTITY="me"

# ---------------------------------------------------------------------------
# Resolve contract ID
# ---------------------------------------------------------------------------
if [[ -z "${NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID:-}" ]]; then
  if [[ -f "${FRONTEND_ENV}" ]]; then
    # shellcheck disable=SC1090
    NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID="$(grep '^NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID=' "${FRONTEND_ENV}" \
      | head -1 | cut -d= -f2)"
  fi
fi

if [[ -z "${NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID:-}" ]]; then
  echo "ERROR: NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID is not set."
  echo "Run ./scripts/deploy.sh first, or export the variable."
  exit 1
fi

export LYRICSFLIP_CONTRACT_ID="${NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID}"
export STELLAR_NETWORK="${NETWORK}"

# ---------------------------------------------------------------------------
# Try the unified seeder (LF-353) first
# ---------------------------------------------------------------------------
if command -v node &>/dev/null && [[ -d "${BACKEND_DIR}/node_modules" ]]; then
  log() { echo "[seed-cards.sh] $*"; }
  log "Using unified seeder (LF-353) — DB + chain from one source."
  log "Contract: ${LYRICSFLIP_CONTRACT_ID} on ${NETWORK}"
  log "Identity: ${IDENTITY}"

  cd "${BACKEND_DIR}"
  exec npm run seed:unified
fi

# ---------------------------------------------------------------------------
# Fallback: direct CLI invocation (original path)
# ---------------------------------------------------------------------------
log() { echo "[seed-cards.sh] $*"; }

# ---------------------------------------------------------------------------
# Network configuration
# ---------------------------------------------------------------------------
# The "local" network targets the Stellar quickstart container defined in
# docker-compose.yml (started with `--local --enable rpc`).  Its standalone
# network passphrase differs from testnet, so we pass explicit RPC URL and
# passphrase flags instead of relying on a named network in the CLI config.
LOCAL_RPC_URL="${LOCAL_RPC_URL:-http://localhost:8000/soroban/rpc}"
LOCAL_NETWORK_PASSPHRASE="Standalone Network ; February 2017"

NETWORK_ARGS=()
case "${NETWORK}" in
  local)
    NETWORK_ARGS=(
      --rpc-url "${LOCAL_RPC_URL}"
      --network-passphrase "${LOCAL_NETWORK_PASSPHRASE}"
    )
    ;;
  *)
    NETWORK_ARGS=(--network "${NETWORK}")
    ;;
esac

CONTRACT_ID="${NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID}"
OWNER_ADDRESS="$(stellar keys address "${IDENTITY}")"

log "Fallback mode: direct CLI invocation (no DB write-back)."
log "Seeding cards into ${CONTRACT_ID} on ${NETWORK}…"
log "Caller: ${OWNER_ADDRESS}"

# ---------------------------------------------------------------------------
# Check prerequisites
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install it from https://stedolan.github.io/jq/."
  exit 1
fi

if [[ ! -f "${CARDS_JSON}" ]]; then
  echo "ERROR: ${CARDS_JSON} not found."
  exit 1
fi

CARD_COUNT="$(jq 'length' "${CARDS_JSON}")"
log "Found ${CARD_COUNT} cards in songs.json"

# ---------------------------------------------------------------------------
# Add each card
# ---------------------------------------------------------------------------
INDEX=0
while IFS= read -r CARD_JSON; do
  GENRE="$(echo "${CARD_JSON}" | jq -r '.genre')"
  ARTIST="$(echo "${CARD_JSON}" | jq -r '.artist')"
  TITLE="$(echo "${CARD_JSON}" | jq -r '.title')"
  YEAR="$(echo "${CARD_JSON}" | jq -r '.year')"
  LYRICS="$(echo "${CARD_JSON}" | jq -r '.lyrics')"

  # Build the Soroban-XDR card struct.  card_id is assigned by the contract.
  CARD_STRUCT="{\"card_id\":0,\"genre\":${GENRE},\"artist\":\"${ARTIST}\",\"title\":\"${TITLE}\",\"year\":${YEAR},\"lyrics\":\"${LYRICS}\"}"

  log "  [${INDEX}/${CARD_COUNT}] Adding: ${TITLE} — ${ARTIST} (${YEAR})"
  stellar contract invoke \
    --id "${CONTRACT_ID}" \
    --source "${IDENTITY}" \
    "${NETWORK_ARGS[@]}" \
    -- add_card \
    --caller "${OWNER_ADDRESS}" \
    --card "${CARD_STRUCT}" 2>&1

  INDEX=$((INDEX + 1))
done < <(jq -c '.[]' "${CARDS_JSON}")

log "Seeding complete. ${INDEX} cards added."
log "WARNING: Fallback mode does not write back on-chain card_ids to the database."
log "         Run 'npm run seed:unified' in the backend for full DB + chain sync."
