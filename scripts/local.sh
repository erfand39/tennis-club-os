#!/bin/sh
set -eu

caller=$PWD
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
settings="$root/.local/secrets.env"
push_settings="$root/.local/push.env"
umask 077

docker compose version >/dev/null 2>&1 || {
  printf '%s\n' 'Docker Desktop with Compose is required.' >&2
  exit 1
}

compose() {
  if [ -f "$push_settings" ]; then
    docker compose --env-file "$settings" --profile push "$@"
  else
    docker compose --env-file "$settings" "$@"
  fi
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

selected_volume=$(sed -n 's/^SAM_DATA_VOLUME=//p' "$settings")
if [ -n "$selected_volume" ]; then
  case "$selected_volume" in
    *[!a-z0-9-]|sam-tennis-restored-) printf '%s\n' 'Invalid SAM_DATA_VOLUME.' >&2; exit 1 ;;
    sam-tennis-restored-*) ;;
    *) printf '%s\n' 'Invalid SAM_DATA_VOLUME.' >&2; exit 1 ;;
  esac
  case "${1:-up}" in
    restore-check|restore-stage) ;;
    *)
      if ! docker volume inspect "$selected_volume" >/dev/null 2>&1; then
        printf '%s\n' 'The selected recovery volume does not exist.' >&2
        exit 1
      fi
      ;;
  esac
fi
# An inherited shell variable must not switch the installation to a different database.
unset SAM_DATA_VOLUME

restore_archive() {
  mode=$1
  archive=$2
  shift 2
  [ -f "$archive" ] && [ -s "$archive" ] || { printf '%s\n' 'Select a readable, non-empty club backup.' >&2; return 1; }
  SAM_DB_PASSWORD=$(sed -n 's/^SAM_DB_PASSWORD=//p' "$settings")
  SAM_AUTH_DB_PASSWORD=$(sed -n 's/^SAM_AUTH_DB_PASSWORD=//p' "$settings")
  SAM_WEB_DB_PASSWORD=$(sed -n 's/^SAM_WEB_DB_PASSWORD=//p' "$settings")
  export SAM_DB_PASSWORD SAM_AUTH_DB_PASSWORD SAM_WEB_DB_PASSWORD
  docker run --rm --interactive --pull=never --network none --entrypoint sh \
    -e SAM_DB_PASSWORD -e SAM_AUTH_DB_PASSWORD -e SAM_WEB_DB_PASSWORD \
    --volume "$root/local:/opt/sam:ro" "$@" postgres:17.11-bookworm /opt/sam/restore-archive.sh "$mode" < "$archive"
}

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
  logs)
    if [ -f "$push_settings" ]; then compose logs --tail=120 app auth migrate notifications
    else compose logs --tail=120 app auth migrate
    fi ;;
  push-setup)
    [ "$#" -eq 2 ] || { printf '%s\n' 'Usage: ./scripts/local.sh push-setup mailto:manager@example.com' >&2; exit 2; }
    [ ! -e "$push_settings" ] || { printf '%s\n' 'Push is already configured. Run ./scripts/local.sh up to restart it.' >&2; exit 1; }
    temp=$(mktemp "$root/.local/.push.XXXXXX")
    trap 'rm -f "$temp"' EXIT HUP INT TERM
    compose run --rm --no-deps -T app node scripts/push-keygen.mjs "$2" > "$temp"
    ln "$temp" "$push_settings"
    rm -f "$temp"
    trap - EXIT HUP INT TERM
    compose up -d --no-build --pull never app notifications
    ;;
  setup-code) sed -n 's/^SAM_SETUP_CODE=//p' "$settings" ;;
  recover)
    [ "$#" -eq 2 ] || { printf '%s\n' 'Usage: ./scripts/local.sh recover OWNER_EMAIL' >&2; exit 2; }
    compose exec -T app node scripts/owner-recovery.mjs "$2"
    ;;
  restore-check|restore-stage)
    [ "$#" -eq 2 ] || { printf '%s\n' 'Usage: ./scripts/local.sh restore-check|restore-stage BACKUP' >&2; exit 2; }
    case "$2" in /*) archive=$2 ;; *) archive="$caller/$2" ;; esac
    if [ "$1" = restore-check ]; then
      restore_archive check "$archive"
    else
      volume="sam-tennis-restored-$(date -u '+%Y%m%d%H%M%S')-$(openssl rand -hex 8)"
      if docker volume inspect "$volume" >/dev/null 2>&1; then
        printf '%s\n' 'The recovery volume name already exists.' >&2
        exit 1
      fi
      docker volume create --label sam.tennis.recovery=true "$volume" >/dev/null
      if restore_archive stage "$archive" --mount "type=volume,source=$volume,target=/var/lib/postgresql/data"; then
        printf 'SAM_DATA_VOLUME=%s\n' "$volume"
      else
        docker volume rm "$volume" >/dev/null || true
        exit 1
      fi
    fi
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
  *) printf '%s\n' 'Usage: ./scripts/local.sh {up|start|status|stop|logs|setup-code|recover|backup|restore-check|restore-stage|push-setup}' >&2; exit 2;;
esac
