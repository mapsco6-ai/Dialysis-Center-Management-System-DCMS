#!/bin/sh
set -e

echo "Waiting for Postgres and applying migrations..."
npx prisma migrate deploy

if [ "$RUN_SEED" != "false" ]; then
  echo "Seeding database (idempotent)..."
  npx prisma db seed
fi

echo "Starting DCMS API..."
exec node dist/main.js
