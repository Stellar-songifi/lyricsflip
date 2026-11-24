#!/bin/sh
# docker-entrypoint.sh
# Source contract IDs written by the contracts-init service, then exec CMD.
# The file is optional: when the soroban profile is not active the backend
# runs without contract IDs (health/live still passes, only Stellar features
# are unavailable).
set -e

CONTRACTS_ENV_FILE="${CONTRACTS_ENV_FILE:-/run/contracts/.env}"

if [ -f "${CONTRACTS_ENV_FILE}" ]; then
  # Export every KEY=VALUE line; skip comments and blank lines.
  # shellcheck disable=SC1090
  set -a
  . "${CONTRACTS_ENV_FILE}"
  set +a
fi

exec "$@"
