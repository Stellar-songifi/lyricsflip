#!/usr/bin/env bash
# init.sh — one-shot contract deployment for the local Docker Compose stack.
#
# Flow:
#   1. Wait for the Stellar quickstart RPC to be ready.
#   2. Generate (or reuse) a funded deployer identity "deployer".
#   3. Build is already done at image-build time; WASMs are in /contracts/.
#   4. Deploy game, NFT, and escrow contracts.
#   5. Configure the game contract (set_cards_per_round).
#   6. Seed the card catalogue from /seed/songs.json.
#   7. Write all contract IDs to ${OUTPUT_ENV_FILE} (shared volume).
#
# Environment variables (all have sensible defaults for Compose):
#   SOROBAN_RPC_URL      — RPC endpoint of the quickstart node
#   NETWORK_PASSPHRASE   — Stellar network passphrase
#   OUTPUT_ENV_FILE      — path to write the contracts .env file
#   CARDS_PER_ROUND      — value passed to set_cards_per_round
#   NFT_BASE_URI         — base URI for the NFT contract

set -euo pipefail

SOROBAN_RPC_URL="${SOROBAN_RPC_URL:-http://soroban:8000/soroban/rpc}"
NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE:-Standalone Network ; February 2017}"
OUTPUT_ENV_FILE="${OUTPUT_ENV_FILE:-/run/contracts/.env}"
CARDS_PER_ROUND="${CARDS_PER_ROUND:-5}"
NFT_BASE_URI="${NFT_BASE_URI:-https://lyricsflip.xyz/nft/}"
IDENTITY="deployer"

GAME_WASM="/contracts/lyricsflip.wasm"
NFT_WASM="/contracts/lyricsflip_nft.wasm"
ESCROW_WASM="/contracts/lyricsflip_escrow.wasm"
CARDS_JSON="/seed/songs.json"

NETWORK_FLAGS=(
  --rpc-url   "${SOROBAN_RPC_URL}"
  --network-passphrase "${NETWORK_PASSPHRASE}"
)

log() { echo "[contracts-init] $*"; }
die() { echo "[contracts-init] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Wait for the quickstart RPC
# ---------------------------------------------------------------------------
log "Waiting for Soroban RPC at ${SOROBAN_RPC_URL} …"
MAX_WAIT=120
WAITED=0
until curl -sf -X POST \
       -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
       "${SOROBAN_RPC_URL}" > /dev/null 2>&1; do
  if [ "${WAITED}" -ge "${MAX_WAIT}" ]; then
    die "Timed out waiting for Soroban RPC after ${MAX_WAIT}s."
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done
log "Soroban RPC is ready (waited ${WAITED}s)."

# ---------------------------------------------------------------------------
# 2. Set up the deployer identity
# ---------------------------------------------------------------------------
# Register the local network in the CLI config so --network local works.
if ! stellar network ls 2>/dev/null | grep -qx "local"; then
  stellar network add local \
    --rpc-url "${SOROBAN_RPC_URL}" \
    --network-passphrase "${NETWORK_PASSPHRASE}" >/dev/null
  log "Registered 'local' network in Stellar CLI."
fi

# Generate the key if it doesn't already exist in the CLI config.
if ! stellar keys ls 2>/dev/null | grep -q "^${IDENTITY}$"; then
  stellar keys generate --global "${IDENTITY}" \
    --rpc-url "${SOROBAN_RPC_URL}" \
    --network-passphrase "${NETWORK_PASSPHRASE}"
  log "Generated identity '${IDENTITY}'."
else
  log "Reusing existing identity '${IDENTITY}'."
fi

OWNER_ADDRESS="$(stellar keys address "${IDENTITY}")"
log "Deployer address: ${OWNER_ADDRESS}"

# Fund via friendbot (quickstart exposes it on port 8000).
FRIENDBOT_URL="${SOROBAN_RPC_URL%/soroban/rpc}/friendbot"
log "Funding deployer via friendbot at ${FRIENDBOT_URL} …"
FUND_RESULT="$(curl -sf "${FRIENDBOT_URL}?addr=${OWNER_ADDRESS}" || true)"
if echo "${FUND_RESULT}" | grep -q '"successful":true'; then
  log "Funded successfully."
elif echo "${FUND_RESULT}" | grep -qi '"already funded\|createAccountAlreadyExist"'; then
  log "Account already funded — continuing."
else
  log "Friendbot response: ${FUND_RESULT}"
  log "Continuing — account may already be funded."
fi

# ---------------------------------------------------------------------------
# 3. Deploy game contract
# ---------------------------------------------------------------------------
log "Deploying lyricsflip game contract …"
GAME_CONTRACT_ID="$(stellar contract deploy \
  --wasm "${GAME_WASM}" \
  --source "${IDENTITY}" \
  "${NETWORK_FLAGS[@]}" \
  -- \
  --owner "${OWNER_ADDRESS}")"
log "Game contract: ${GAME_CONTRACT_ID}"

# ---------------------------------------------------------------------------
# 4. Deploy NFT contract  (minter = game contract)
# ---------------------------------------------------------------------------
log "Deploying lyricsflip-nft contract …"
NFT_CONTRACT_ID="$(stellar contract deploy \
  --wasm "${NFT_WASM}" \
  --source "${IDENTITY}" \
  "${NETWORK_FLAGS[@]}" \
  -- \
  --owner    "${OWNER_ADDRESS}" \
  --minter   "${GAME_CONTRACT_ID}" \
  --token_name   "LyricsFlip" \
  --token_symbol "LFLIP" \
  --base_uri     "${NFT_BASE_URI}")"
log "NFT contract: ${NFT_CONTRACT_ID}"

# ---------------------------------------------------------------------------
# 5. Deploy escrow contract
# ---------------------------------------------------------------------------
log "Deploying lyricsflip-escrow contract …"
ESCROW_CONTRACT_ID="$(stellar contract deploy \
  --wasm "${ESCROW_WASM}" \
  --source "${IDENTITY}" \
  "${NETWORK_FLAGS[@]}" \
  -- \
  --owner "${OWNER_ADDRESS}")"
log "Escrow contract: ${ESCROW_CONTRACT_ID}"

# ---------------------------------------------------------------------------
# 6. Configure game contract
# ---------------------------------------------------------------------------
log "Setting cards_per_round to ${CARDS_PER_ROUND} …"
stellar contract invoke \
  --id     "${GAME_CONTRACT_ID}" \
  --source "${IDENTITY}" \
  "${NETWORK_FLAGS[@]}" \
  -- set_cards_per_round \
  --caller "${OWNER_ADDRESS}" \
  --value  "${CARDS_PER_ROUND}"

# ---------------------------------------------------------------------------
# 7. Seed card catalogue
# ---------------------------------------------------------------------------
if [ -f "${CARDS_JSON}" ]; then
  CARD_COUNT="$(jq 'length' "${CARDS_JSON}")"
  log "Seeding ${CARD_COUNT} cards into game contract …"
  INDEX=0
  while IFS= read -r CARD_JSON; do
    GENRE="$(echo "${CARD_JSON}"  | jq -r '.genre')"
    ARTIST="$(echo "${CARD_JSON}" | jq -r '.artist')"
    TITLE="$(echo "${CARD_JSON}"  | jq -r '.title')"
    YEAR="$(echo "${CARD_JSON}"   | jq -r '.year')"
    LYRICS="$(echo "${CARD_JSON}" | jq -r '.lyrics')"

    CARD_STRUCT="{\"card_id\":0,\"genre\":${GENRE},\"artist\":\"${ARTIST}\",\"title\":\"${TITLE}\",\"year\":${YEAR},\"lyrics\":\"${LYRICS}\"}"

    stellar contract invoke \
      --id     "${GAME_CONTRACT_ID}" \
      --source "${IDENTITY}" \
      "${NETWORK_FLAGS[@]}" \
      -- add_card \
      --caller "${OWNER_ADDRESS}" \
      --card   "${CARD_STRUCT}" >/dev/null 2>&1

    INDEX=$((INDEX + 1))
    # Progress every 10 cards to avoid log noise.
    if [ $((INDEX % 10)) -eq 0 ]; then
      log "  ${INDEX}/${CARD_COUNT} cards seeded …"
    fi
  done < <(jq -c '.[]' "${CARDS_JSON}")
  log "Card seeding complete: ${INDEX} cards added."
else
  log "WARNING: ${CARDS_JSON} not found — skipping card seeding."
fi

# ---------------------------------------------------------------------------
# 8. Write contract IDs to the shared volume
# ---------------------------------------------------------------------------
OUTPUT_DIR="$(dirname "${OUTPUT_ENV_FILE}")"
mkdir -p "${OUTPUT_DIR}"

log "Writing contract IDs to ${OUTPUT_ENV_FILE} …"
cat > "${OUTPUT_ENV_FILE}" <<EOF
# Generated by contracts-init on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Do not edit by hand — this file is overwritten on every fresh deploy.

# Backend env vars
LYRICSFLIP_CONTRACT_ID=${GAME_CONTRACT_ID}
LYRICSFLIP_NFT_CONTRACT_ID=${NFT_CONTRACT_ID}
LYRICSFLIP_ESCROW_CONTRACT_ID=${ESCROW_CONTRACT_ID}
STELLAR_NETWORK=local
STELLAR_RPC_URL=${SOROBAN_RPC_URL}
SOROBAN_RPC_URL=${SOROBAN_RPC_URL}

# Frontend (NEXT_PUBLIC_*) env vars
NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID=${GAME_CONTRACT_ID}
NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID=${NFT_CONTRACT_ID}
NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID=${ESCROW_CONTRACT_ID}
NEXT_PUBLIC_STELLAR_RPC_URL=${SOROBAN_RPC_URL}
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=${NETWORK_PASSPHRASE}
EOF

log "Done."
log "  Game contract  : ${GAME_CONTRACT_ID}"
log "  NFT  contract  : ${NFT_CONTRACT_ID}"
log "  Escrow contract: ${ESCROW_CONTRACT_ID}"
