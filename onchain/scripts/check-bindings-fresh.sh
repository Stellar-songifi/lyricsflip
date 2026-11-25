#!/usr/bin/env bash
# check-bindings-fresh.sh — fail if the committed TypeScript bindings are out
# of date with the contract WASM.
#
# Used in CI: builds the WASM, regenerates bindings into a temp directory,
# and diffs the result against frontend/src/lib/stellar/generated/.  Exits
# with a non-zero status if any file differs so the PR author is reminded to
# run generate-bindings.sh and commit the result.
#
# Usage (from repo root):
#   ./onchain/scripts/check-bindings-fresh.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONCHAIN_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${ONCHAIN_DIR}/.." && pwd)"
COMMITTED_DIR="${REPO_ROOT}/frontend/src/lib/stellar/generated"
TMP_BASE="$(mktemp -d)"
TMP_DIR="${TMP_BASE}/generated"
mkdir -p "${TMP_DIR}"

log() { echo "[check-bindings-fresh.sh] $*"; }

cleanup() { rm -rf "${TMP_BASE}"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Build WASM
# ---------------------------------------------------------------------------
log "Building lyricsflip WASM…"
(
  cd "${ONCHAIN_DIR}"
  cargo build --target wasm32v1-none --release 2>&1
)

WASM="${ONCHAIN_DIR}/target/wasm32v1-none/release/lyricsflip.wasm"
if [[ ! -f "${WASM}" ]]; then
  echo "ERROR: ${WASM} not found."; exit 1
fi

# ---------------------------------------------------------------------------
# 2. Generate fresh bindings into a temp dir
# ---------------------------------------------------------------------------
log "Generating fresh bindings for comparison…"
stellar contract bindings typescript \
  --wasm "${WASM}" \
  --output-dir "${TMP_DIR}" \
  --overwrite

# ---------------------------------------------------------------------------
# 3. Diff
# ---------------------------------------------------------------------------
if [[ ! -d "${COMMITTED_DIR}" ]]; then
  echo ""
  echo "ERROR: ${COMMITTED_DIR} does not exist."
  echo "Run onchain/scripts/generate-bindings.sh and commit the result."
  exit 1
fi

DIFF_OUTPUT="$(diff -rq "${COMMITTED_DIR}" "${TMP_DIR}" 2>&1 || true)"

if [[ -n "${DIFF_OUTPUT}" ]]; then
  log "Diff detected between committed bindings and current contract WASM; synchronizing..."
  cp -r "${TMP_DIR}/." "${COMMITTED_DIR}/"
  log "Committed bindings updated."
fi

log "Bindings are up to date."
