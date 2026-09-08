#!/bin/bash
# Restores a dump made by backup-db.sh into the running docker-compose
# Postgres. DESTRUCTIVE: drops and recreates the public schema first, so
# every current row is gone the moment this runs. Never point this at a
# database with data you haven't backed up separately.
#
# Usage: ./scripts/restore-db.sh path/to/dcms-<timestamp>.sql.gz
set -euo pipefail

DUMP_FILE="${1:?Usage: restore-db.sh path/to/dcms-<timestamp>.sql.gz}"
if [ ! -f "$DUMP_FILE" ]; then
  echo "File not found: $DUMP_FILE" >&2
  exit 1
fi

read -r -p "This will ERASE the current dcms database and replace it with $DUMP_FILE. Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "Dropping and recreating the public schema..."
docker compose exec -T postgres psql -U dcms -d dcms -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "Restoring from $DUMP_FILE..."
gunzip -c "$DUMP_FILE" | docker compose exec -T postgres psql -U dcms -d dcms

echo "Restore complete. Re-run apps/api/prisma/harden-db.sql if this restore predates the dcms_app hardening step."
