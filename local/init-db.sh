#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=auth_password="$SAM_AUTH_DB_PASSWORD" --set=web_password="$SAM_WEB_DB_PASSWORD" \
  -f /opt/sam/init-db.sql
