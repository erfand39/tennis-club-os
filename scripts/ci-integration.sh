#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
cd "$root"

# Every CI run owns its test database and does not use the installation's settings.
export SAM_ORIGIN=http://127.0.0.1:4030 SAM_PORT=4030
export SAM_TEST_ORIGIN="$SAM_ORIGIN"
for key in SAM_DB_PASSWORD SAM_AUTH_DB_PASSWORD SAM_WEB_DB_PASSWORD SAM_JWT_SECRET SAM_SESSION_KEY SAM_SETUP_CODE SAM_TEST_OWNER_PASSWORD; do
  printf -v "$key" '%s' "$(openssl rand -hex 32)"
  export "$key"
done
export SAM_DATA_VOLUME="sam-tennis-ci-${work##*.}"
export SAM_TEST_SETUP_CODE="$SAM_SETUP_CODE"
export SAM_TEST_DATABASE_URL="postgresql://postgres:$SAM_DB_PASSWORD@127.0.0.1:55478/postgres"
export TENNIS_TEST_DATABASE_URL="$SAM_TEST_DATABASE_URL"

cat > "$work/compose.yml" <<'YAML'
services:
  db:
    ports:
      - "127.0.0.1:55478:5432"
YAML

stack=(docker compose --env-file /dev/null -p sam-tennis-ci -f compose.yaml -f "$work/compose.yml")
cleanup() {
  "${stack[@]}" down --volumes --remove-orphans || true
  rm -rf "$work"
}
trap cleanup EXIT
"${stack[@]}" up -d --build --wait --wait-timeout 240 app
npm run test:db
npm run test:local
npm run test:pwa

if [[ ${1:-} == recovery ]]; then
  auth="$("${stack[@]}" ps -q auth)"
  docker cp "$auth:/usr/local/bin/auth" "$work/auth"
  docker cp "$auth:/usr/local/etc/auth/migrations" "$work/migrations"
  export SAM_RECOVERY_SOURCE_URL="$SAM_TEST_DATABASE_URL"
  export SAM_RECOVERY_AUTH_BIN="$work/auth" SAM_RECOVERY_AUTH_MIGRATIONS="$work/migrations"
  npm run test:recovery
fi
