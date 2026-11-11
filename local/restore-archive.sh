#!/bin/sh
set -eu

# Invoked in a network-isolated container with a fresh data volume.
if [ "$(id -u)" -eq 0 ]; then
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
  exec gosu postgres sh "$0" "$@"
fi

case "${1:-}" in check|stage) mode=$1 ;; *) exit 2 ;; esac
mkdir -p "$PGDATA"
if [ -n "$(ls -A "$PGDATA")" ]; then
  printf '%s\n' 'Recovery requires an empty PostgreSQL data directory.' >&2
  exit 1
fi

umask 077
work=$(mktemp -d)
started=no
cleanup() {
  if [ "$started" = yes ]; then pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null; fi
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
printf '%s\n' "$SAM_DB_PASSWORD" > "$work/password"
initdb -D "$PGDATA" --username=postgres --encoding=UTF8 --auth-local=peer --auth-host=scram-sha-256 \
  --pwfile="$work/password" >/dev/null
rm "$work/password"
if [ "$mode" = stage ]; then
  # Match the official image's authenticated connections over the Compose backend.
  printf '\nhost all all all scram-sha-256\n' >> "$PGDATA/pg_hba.conf"
fi
restore_port=${PGPORT:-5432}
case "$restore_port" in ''|*[!0-9]*) exit 2 ;; esac
if ! pg_ctl -D "$PGDATA" -l "$work/postgres.log" \
  -o "-h 127.0.0.1 -c unix_socket_directories='' -p $restore_port" -w start >/dev/null; then
  cat "$work/postgres.log" >&2
  exit 1
fi
started=yes
export PGHOST=127.0.0.1 PGPORT="$restore_port" PGUSER=postgres PGDATABASE=postgres PGPASSWORD="$SAM_DB_PASSWORD"
# pg_dump does not include PostgreSQL cluster roles. The archive supplies schemas and extensions.
psql -X -q --set=ON_ERROR_STOP=1 --set=auth_password="$SAM_AUTH_DB_PASSWORD" \
  --set=web_password="$SAM_WEB_DB_PASSWORD" --file="$(dirname "$0")/init-roles.sql" </dev/null
pg_restore --format=custom --exit-on-error --single-transaction --dbname=postgres
psql -X -q --set=ON_ERROR_STOP=1 --file="$(dirname "$0")/restore-verify.sql" </dev/null
if [ "$mode" = stage ]; then
  psql -X -q --set=ON_ERROR_STOP=1 --single-transaction <<'SQL'
delete from tennis_runtime.web_sessions;
do $$
begin
  if to_regclass('tennis_runtime.push_devices') is not null then
    delete from tennis_runtime.push_devices;
  end if;
end
$$;
SQL
fi
