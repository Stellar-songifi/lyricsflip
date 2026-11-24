#!/bin/sh
# docker-entrypoint.sh
# Source contract IDs written by the contracts-init service, then exec CMD.
set -e

CONTRACTS_ENV_FILE="${CONTRACTS_ENV_FILE:-/run/contracts/.env}"

if [ -f "${CONTRACTS_ENV_FILE}" ]; then
  set -a
  . "${CONTRACTS_ENV_FILE}"
  set +a
fi

exec "$@"
