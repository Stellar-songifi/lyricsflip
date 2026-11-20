#!/usr/bin/env bash
# seed-cards.sh — read seed/songs.json and invoke add_card for each
# entry against the deployed LyricsFlip game contract.
#
# Usage:
#   ./scripts/seed-cards.sh [network]   (default: testnet)
#
# Prerequisites:
#   • deploy.sh has already been run (NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID must
#     be set in frontend/.env.local, or exported in the environment).
#   • Stellar CLI installed.
#   • jq installed (https://stedolan.github.io/jq/).
#   • A funded identity called "me" on the target network.

set -euo pipefail

NETWORK="${1:-testnet}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONCHAIN_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${ONCHAIN_DIR}/.." && pwd)"
FRONTEND_ENV="${REPO_ROOT}/frontend/.env.local"
CARDS_JSON="${REPO_ROOT}/seed/songs.json"

IDENTITY="me"

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

log() { echo "[seed-cards.sh] $*"; }

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

CONTRACT_ID="${NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID}"
OWNER_ADDRESS="$(stellar keys address "${IDENTITY}")"

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
log "Found ${CARD_COUNT} cards in cards.json"

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
