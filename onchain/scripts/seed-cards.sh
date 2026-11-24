#!/usr/bin/env bash
# seed-cards.sh — batch-load seed/songs.json into the deployed LyricsFlip game
# contract with `add_cards`, skipping cards that are already present.
#
# Usage:
#   ./scripts/seed-cards.sh [network]   (default: testnet)
#
# Environment:
#   STELLAR_IDENTITY                    funded Stellar CLI identity (default: me)
#   LYRICSFLIP_CONTRACT_ID /            contract to seed; falls back to
#   NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID  frontend/.env.local
#   LOCAL_RPC_URL                       RPC endpoint for the `local` network
#
# Prerequisites:
#   • deploy.sh has already been run (or the contract id is exported).
#   • Stellar CLI and jq installed (https://stedolan.github.io/jq/).
#   • A funded identity called "me" on the target network (or STELLAR_IDENTITY).

set -euo pipefail

NETWORK="${1:-testnet}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONCHAIN_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${ONCHAIN_DIR}/.." && pwd)"
FRONTEND_ENV="${REPO_ROOT}/frontend/.env.local"
CARDS_JSON="${REPO_ROOT}/seed/songs.json"
BATCH_SIZE=20

IDENTITY="${STELLAR_IDENTITY:-me}"

log() { echo "[seed-cards.sh] $*"; }

# ---------------------------------------------------------------------------
# Network configuration
# ---------------------------------------------------------------------------
# The "local" network targets the Stellar quickstart container defined in
# docker-compose.yml (started with `--local --enable rpc`). Its standalone
# network passphrase differs from testnet, so pass explicit RPC URL and
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

# ---------------------------------------------------------------------------
# Resolve contract ID
# ---------------------------------------------------------------------------
CONTRACT_ID="${LYRICSFLIP_CONTRACT_ID:-${NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID:-}}"

if [[ -z "${CONTRACT_ID}" && -f "${FRONTEND_ENV}" ]]; then
  # shellcheck disable=SC1090
  CONTRACT_ID="$(grep '^NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID=' "${FRONTEND_ENV}" \
    | head -1 | cut -d= -f2)"
fi

if [[ -z "${CONTRACT_ID}" ]]; then
  echo "ERROR: NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID is not set." >&2
  echo "Run ./scripts/deploy.sh first, or export the variable." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Check prerequisites
# ---------------------------------------------------------------------------
for tool in jq stellar; do
  if ! command -v "${tool}" &>/dev/null; then
    echo "ERROR: ${tool} is required to seed cards." >&2
    exit 1
  fi
done

if [[ ! -f "${CARDS_JSON}" ]]; then
  echo "ERROR: ${CARDS_JSON} not found." >&2
  exit 1
fi

OWNER_ADDRESS="$(stellar keys address "${IDENTITY}")"

log "Seeding cards into ${CONTRACT_ID} on ${NETWORK}…"
log "Caller: ${OWNER_ADDRESS}"

CARD_COUNT="$(jq 'length' "${CARDS_JSON}")"
log "Found ${CARD_COUNT} songs in seed/songs.json"

# difficulty is a required Card field (1–3) and must be present in the seed
# file; the JSON Schema in seed/songs.schema.json enforces this in CI.
if ! jq -e 'all(.[]; (.difficulty | type == "number") and .difficulty >= 1 and .difficulty <= 3)' \
    "${CARDS_JSON}" >/dev/null; then
  echo "ERROR: every song needs an integer difficulty between 1 and 3." >&2
  exit 1
fi

# jq builds every payload, so quotes and backslashes in lyrics stay valid JSON.
# One compact object per line; batches are assembled below with `jq -s`.
mapfile -t CARDS < <(
  jq -c '.[] | {card_id:0, genre, artist, title, year, difficulty, lyrics}' "${CARDS_JSON}"
)

if ((${#CARDS[@]} != CARD_COUNT)); then
  echo "ERROR: failed to build payloads for every song." >&2
  exit 1
fi

BATCH_TOTAL=$(((CARD_COUNT + BATCH_SIZE - 1) / BATCH_SIZE))
ADDED=0
DUPLICATES=0
FAILED=0
WRITES=0
BATCH_NUM=0
BATCH=()

# The contract reports an already-inserted card as DuplicateCard (#31).
# CLI versions spell the error differently, so match either form.
is_duplicate_error() {
  grep -Eqi 'DuplicateCard|Error\(Contract, #31\)|duplicate card' <<<"$1"
}

invoke() {
  local method="$1" arg_name="$2" value="$3"
  stellar contract invoke \
    --id "${CONTRACT_ID}" \
    --source "${IDENTITY}" \
    "${NETWORK_ARGS[@]}" \
    -- "${method}" \
    --caller "${OWNER_ADDRESS}" \
    "${arg_name}" "${value}" 2>&1
}

flush_batch() {
  local batch_json size output card card_output
  ((${#BATCH[@]} > 0)) || return 0

  batch_json="$(printf '%s\n' "${BATCH[@]}" | jq -sc '.')"
  size="${#BATCH[@]}"
  BATCH_NUM=$((BATCH_NUM + 1))
  log "Batch ${BATCH_NUM}/${BATCH_TOTAL} — ${size} card(s)"

  if output="$(invoke add_cards --cards "${batch_json}")"; then
    ADDED=$((ADDED + size))
    WRITES=$((WRITES + 1))
    log "  added ${size} card(s)"
  elif is_duplicate_error "${output}"; then
    # add_cards is atomic: one duplicate rejects the whole batch. Retry the
    # batch one card at a time so only the duplicates are skipped.
    log "  batch contains a duplicate — retrying card-by-card"
    while IFS= read -r card; do
      if card_output="$(invoke add_card --card "${card}")"; then
        ADDED=$((ADDED + 1))
        WRITES=$((WRITES + 1))
      elif is_duplicate_error "${card_output}"; then
        DUPLICATES=$((DUPLICATES + 1))
      else
        printf '%s\n' "${card_output}" >&2
        FAILED=$((FAILED + 1))
      fi
    done < <(jq -c '.[]' <<<"${batch_json}")
  else
    printf '%s\n' "${output}" >&2
    echo "ERROR: add_cards failed for batch ${BATCH_NUM}." >&2
    exit 1
  fi

  BATCH=()
}

for card in "${CARDS[@]}"; do
  BATCH+=("${card}")
  if ((${#BATCH[@]} == BATCH_SIZE)); then
    flush_batch
  fi
done
flush_batch

log "Summary: ${ADDED}/${CARD_COUNT} card(s) added, ${DUPLICATES} duplicate(s) skipped, \
${FAILED} failure(s), ${WRITES} successful write transaction(s)."

if ((FAILED > 0)); then
  echo "ERROR: ${FAILED} card(s) could not be added." >&2
  exit 1
fi
