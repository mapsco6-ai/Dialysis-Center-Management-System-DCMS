#!/bin/sh
set -e

echo "Waiting for Postgres and applying migrations..."
npx prisma migrate deploy

# Revokes UPDATE/DELETE on audit_logs and DELETE on medical-history tables
# from the restricted dcms_app role (used by the running server itself).
# Must run with the owner connection - dcms_app can't revoke its own rights.
# Harmless to re-run: revoking an already-revoked privilege is a no-op.
if [ -n "$APP_DATABASE_URL" ]; then
  echo "Hardening dcms_app DB permissions..."
  npx prisma db execute --file ./prisma/harden-db.sql --url "$DATABASE_URL"
fi

if [ "$RUN_SEED" != "false" ]; then
  echo "Seeding database (idempotent)..."
  npx prisma db seed
fi

echo "Starting DCMS API..."
exec node dist/main.js
