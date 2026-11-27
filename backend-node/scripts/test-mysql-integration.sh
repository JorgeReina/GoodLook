#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Docker no está disponible' >&2; exit 1; }
docker compose version >/dev/null
project="goodlook-test-$(node -e 'process.stdout.write(require("crypto").randomBytes(8).toString("hex"))')"
dialect="${1:-mysql}"
case "$dialect" in
  mysql) compose=(docker compose -p "$project" -f compose.integration.yaml) ;;
  mariadb) compose=(docker compose -p "$project" -f compose.integration.yaml -f compose.mariadb.integration.yaml) ;;
  *) echo 'Use mysql or mariadb' >&2; exit 1 ;;
esac
cleanup() { "${compose[@]}" down --volumes --remove-orphans; }
trap cleanup EXIT
"${compose[@]}" up -d --wait --wait-timeout 120
container_id=$("${compose[@]}" ps -q mysql)
test -n "$container_id"
GOODLOOK_MIGRATION_DIALECT="$dialect" GOODLOOK_TEST_CONTAINER_ID="$container_id" GOODLOOK_RUN_MYSQL_TESTS=1 node --import tsx --test test/integration/*.test.ts
