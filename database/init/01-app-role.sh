#!/bin/bash
# Runs once, only the first time the postgres data volume is initialized
# (official postgres image convention: anything in /docker-entrypoint-initdb.d
# runs on an empty data directory, in filename order). Tables don't exist yet
# at this point - migrations run later, from the api container's entrypoint -
# so this only creates the restricted role and sets DEFAULT PRIVILEGES for
# tables that will be created later by the owner role. The actual REVOKE of
# dangerous privileges on specific tables happens afterwards, in
# apps/api/prisma/harden-db.sql, once those tables actually exist.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE dcms_app WITH LOGIN PASSWORD '${APP_DB_PASSWORD}';
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO dcms_app;
  GRANT USAGE ON SCHEMA public TO dcms_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dcms_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dcms_app;
EOSQL
