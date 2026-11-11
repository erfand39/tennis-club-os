#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
settings="$root/.local/secrets.env"
umask 077

docker compose version >/dev/null 2>&1 || {
  printf '%s\n' 'Docker Desktop with Compose is required.' >&2
  exit 1
}

compose() {
  docker compose --env-file "$settings" "$@"
}

origin() {
  sed -n 's/^SAM_ORIGIN=//p' "$settings"
}

if [ "${1:-up}" = up ] && [ ! -f "$settings" ]; then
  docker info >/dev/null 2>&1 || { printf '%s\n' 'Start Docker Desktop first.' >&2; exit 1; }
  if docker volume inspect sam-tennis-pgdata-v1 >/dev/null 2>&1; then
    printf '%s\n' 'The existing database requires its original .local/secrets.env.' >&2
    exit 1
  fi
  command -v openssl >/dev/null
  mkdir -p .local
  chmod 700 .local
  temp=$(mktemp "$root/.local/.setup.XXXXXX")
  trap 'rm -f "$temp"' EXIT HUP INT TERM
  port=${SAM_LOCAL_PORT:-3030}
  case "$port" in *[!0-9]*|'') printf '%s\n' 'Invalid SAM_LOCAL_PORT.' >&2; exit 1;; esac
  [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || exit 1
  {
    printf 'SAM_PORT=%s\nSAM_ORIGIN=http://127.0.0.1:%s\n' "$port" "$port"
    for key in SAM_DB_PASSWORD SAM_AUTH_DB_PASSWORD SAM_WEB_DB_PASSWORD SAM_JWT_SECRET SAM_SESSION_KEY SAM_SETUP_CODE; do
      value=$(openssl rand -hex 32)
      printf '%s=%s\n' "$key" "$value"
    done
  } > "$temp"
  # Publish the file atomically without overwriting another installation's keys.
  if ! ln "$temp" "$settings" 2>/dev/null && [ ! -f "$settings" ]; then
    printf '%s\n' 'Could not save local installation keys.' >&2
    exit 1
  fi
  rm -f "$temp"
  trap - EXIT HUP INT TERM
fi

[ -f "$settings" ] || { printf '%s\n' 'Run ./scripts/local.sh up first.' >&2; exit 1; }

case "${1:-up}" in
  up)
    compose up -d --build --wait --wait-timeout 240
    printf 'سامانهٔ باشگاه تنیس سام\n%s\n' "$(origin)"
    printf '%s\n' 'کد راه‌اندازی اولیه: ./scripts/local.sh setup-code'
    ;;
  start)
    compose up -d --no-build --pull never --wait --wait-timeout 240
    printf '%s\n' "$(origin)"
    ;;
  status) compose ps -a ;;
  stop) compose stop ;;
  logs) compose logs --tail=120 app auth migrate ;;
  setup-code) sed -n 's/^SAM_SETUP_CODE=//p' "$settings" ;;
  recover)
    [ "$#" -eq 2 ] || { printf '%s\n' 'Usage: ./scripts/local.sh recover OWNER_EMAIL' >&2; exit 2; }
    compose exec -T app node scripts/owner-recovery.mjs "$2"
    ;;
  backup)
    mkdir -p .local/backups
    temp=$(mktemp "$root/.local/backups/.backup.XXXXXX")
    trap 'rm -f "$temp"' EXIT HUP INT TERM
    compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -h 127.0.0.1 -U postgres -d postgres --format=custom' > "$temp"
    suffix=${temp##*.}
    final="$root/.local/backups/sam-$(date -u '+%Y%m%dT%H%M%SZ')-$suffix.dump"
    mv "$temp" "$final"
    trap - EXIT HUP INT TERM
    printf '%s\n' "$final"
    ;;
  *) printf '%s\n' 'Usage: ./scripts/local.sh {up|start|status|stop|logs|setup-code|recover|backup}' >&2; exit 2;;
esac
