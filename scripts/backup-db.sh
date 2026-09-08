#!/bin/bash
# Dumps the running docker-compose Postgres to a local, timestamped file.
#
# This is a starting point, not a complete disaster-recovery plan (docs
# review DCMS-019): it does not copy the dump off this machine, does not run
# on a schedule by itself, and does not give you point-in-time recovery.
# Before relying on this operationally: automate a schedule (cron/systemd
# timer calling this script), copy backups/ to different physical storage
# (another disk, off-site, or object storage), and periodically test
# restore-db.sh actually works end to end.
#
# Usage: ./scripts/backup-db.sh [output-directory]  (default: ./backups)
set -euo pipefail

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="$OUT_DIR/dcms-$TIMESTAMP.sql.gz"

echo "Dumping dcms database from the running postgres container..."
docker compose exec -T postgres pg_dump -U dcms -d dcms --format=plain | gzip > "$OUT_FILE"

echo "Wrote $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
