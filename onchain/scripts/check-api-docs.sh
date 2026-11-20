#!/usr/bin/env bash
#
# Checks that docs/api.md documents every public function, error variant,
# and event the `lyricsflip` and `lyricsflip-nft` contracts actually expose,
# so the three places that describe the contract surface (docs/api.md,
# onchain/README.md, README.md — which both link to docs/api.md instead of
# duplicating it) can't silently drift from the real interface again.
#
# This isn't a full doc generator: it doesn't write prose, it only verifies
# that every name on the real contract surface has a matching entry in
# docs/api.md. Run it after adding, renaming, or removing a public function,
# error, or event.
#
# Usage: onchain/scripts/check-api-docs.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_DOC="docs/api.md"
missing=0

# Extracts `pub fn NAME(` names from the single #[contractimpl] block of a
# contract's lib.rs, stopping before a second, plain `impl Type {` block
# (used by lyricsflip for private helpers that aren't part of the client).
contract_functions() {
  awk '
    /#\[contractimpl\]/ { in_block = 1; expect_open = 1; next }
    in_block && expect_open && /^impl / { expect_open = 0; next }
    in_block && !expect_open && /^impl / { in_block = 0 }
    in_block && /pub fn /
  ' "$1" | sed -E 's/^\s*pub fn ([a-zA-Z0-9_]+).*/\1/' | sort -u
}

error_variants() {
  awk '/pub enum Error/{f=1; next} f && /^}/{f=0} f' "$1" \
    | grep -oE '^\s*[A-Za-z][A-Za-z0-9]* = [0-9]+' \
    | sed -E 's/^\s*([A-Za-z0-9]+).*/\1/' | sort -u
}

event_names() {
  awk '
    /#\[contractevent\]/ { pending = 1; next }
    pending && /^#\[/ { next }
    pending && /^pub struct / { print $3; pending = 0; next }
    { pending = 0 }
  ' "$1" | sort -u
}

check_names() {
  local label="$1"
  shift
  for name in "$@"; do
    if ! grep -q "$name" "$API_DOC"; then
      echo "MISSING from $API_DOC: $label '$name'" >&2
      missing=$((missing + 1))
    fi
  done
}

check_names "function" $(contract_functions contracts/lyricsflip/src/lib.rs)
check_names "error" $(error_variants contracts/lyricsflip/src/errors.rs)
check_names "event" $(event_names contracts/lyricsflip/src/events.rs)

check_names "function" $(contract_functions contracts/lyricsflip-nft/src/lib.rs)
check_names "error" $(error_variants contracts/lyricsflip-nft/src/lib.rs)
check_names "event" $(event_names contracts/lyricsflip-nft/src/lib.rs)

if [ "$missing" -gt 0 ]; then
  echo "error: $missing item(s) missing from $API_DOC — add them, then re-run this check." >&2
  exit 1
fi

echo "ok: $API_DOC covers every public function, error, and event."
