#!/usr/bin/env bash
# LF-285: checks every badge metadata file in onchain/metadata against the
# keys and attribute trait types in template.json.
set -euo pipefail

dir="$(cd "$(dirname "$0")/../metadata" && pwd)"
template="$dir/template.json"
keys='[keys_unsorted[]] | sort'
traits='[.attributes[].trait_type] | sort'

want_keys="$(jq -c "$keys" "$template")"
# Token ID is filled per token by the indexer, not in the per-kind files.
want_traits="$(jq -c "$traits - [\"Token ID\"]" "$template")"

status=0
for f in "$dir"/[0-9]*.json; do
  kind="$(basename "$f" .json)"
  if [ "$(jq -c "$keys" "$f")" != "$want_keys" ]; then
    echo "$f: top-level keys do not match template.json"; status=1
  fi
  if [ "$(jq -c "$traits" "$f")" != "$want_traits" ]; then
    echo "$f: attribute trait types do not match template.json"; status=1
  fi
  if [ "$(jq -r '.attributes[] | select(.trait_type == "Kind") | .value' "$f")" != "$kind" ]; then
    echo "$f: Kind attribute does not match file name"; status=1
  fi
  if ! jq -e --arg k "$kind" '.image | endswith("/" + $k + ".png")' "$f" >/dev/null; then
    echo "$f: image does not point at $kind.png"; status=1
  fi
done

[ "$status" -eq 0 ] && echo "All metadata files match template.json"
exit "$status"
