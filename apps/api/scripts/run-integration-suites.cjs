#!/usr/bin/env node
// Runs the disposable-database review suites (reception, phase456, complete)
// against fresh databases, one suite at a time.
//
// Each suite script hard-codes its own database name (reception_test,
// phase456_test, complete_test) as a safety rail against ever pointing at a
// real database. That means two people - or two terminals - running this at
// the same time would recreate/drop each other's database mid-run and both
// come back with a false "0 passed" instead of a real failure. This script
// closes that gap with an exclusive lock: a second run started while one is
// already in progress fails fast with a clear message instead of racing it.
// A lock left behind by a crashed/killed process is detected (dead PID) and
// reclaimed automatically, so it never needs manual cleanup.
//
// Usage:
//   node scripts/run-integration-suites.cjs [reception|phase456|complete|all]
//
// Needs apps/api/.env (DATABASE_URL, APP_DATABASE_URL) - the same admin
// connection `npm run prisma:migrate` uses - to create/drop the disposable
// databases and grant the restricted app role its normal privileges.
require('dotenv/config');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const LOCK_PATH = path.join(os.tmpdir(), 'dcms-integration-suite.lock');
const STALE_MS = 30 * 60 * 1000; // a crashed run older than this is never legitimate

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function acquireLock() {
  for (;;) {
    try {
      fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), { flag: 'wx' });
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const holder = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    const stale = Date.now() - holder.startedAt > STALE_MS || !processAlive(holder.pid);
    if (stale) {
      fs.rmSync(LOCK_PATH, { force: true });
      continue;
    }
    throw new Error(
      `Another integration run (pid ${holder.pid}) is already using the disposable test databases - ` +
        `wait for it to finish. If it crashed without cleaning up, delete ${LOCK_PATH} and retry.`,
    );
  }
}

function releaseLock() {
  fs.rmSync(LOCK_PATH, { force: true });
}

function adminUrl(pathname) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = pathname;
  return url;
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    shell: process.platform === 'win32',
    ...options,
  });
}

function sql(text, url) {
  execFileSync('npx', ['prisma', 'db', 'execute', '--url', url.href, '--stdin'], {
    cwd: path.join(__dirname, '..'),
    input: text,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
}

// Fresh database, migrated, with the restricted runtime role granted its
// normal privileges and hardened - the same steps `docker-entrypoint.sh`
// does for a real deployment, so the suite runs against a faithful copy.
function provision(dbName) {
  const server = adminUrl('/postgres');
  const dbUrl = adminUrl(`/${dbName}`);
  // Each `prisma db execute` call runs its script as one transaction, and
  // Postgres refuses DROP/CREATE DATABASE inside a transaction - two calls.
  sql(`DROP DATABASE IF EXISTS "${dbName}";`, server);
  sql(`CREATE DATABASE "${dbName}";`, server);
  run('npx', ['prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: dbUrl.href } });
  const appRole = new URL(process.env.APP_DATABASE_URL).username;
  // GRANT ON SCHEMA/ALL TABLES applies to whatever database the connection
  // is on - it must run against dbUrl (the new database), not the "postgres"
  // maintenance connection, or the app role ends up with no table access and
  // every request 500s with a permission-denied error from Postgres.
  sql(
    `GRANT CONNECT ON DATABASE "${dbName}" TO ${appRole}; ` +
      `GRANT USAGE ON SCHEMA public TO ${appRole}; ` +
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}; ` +
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appRole};`,
    dbUrl,
  );
  run('npx', ['prisma', 'db', 'execute', '--file', 'prisma/harden-db.sql', '--url', dbUrl.href]);
  return dbUrl;
}

function appUrl(dbName) {
  const url = new URL(process.env.APP_DATABASE_URL);
  url.pathname = `/${dbName}`;
  return url;
}

const SUITES = {
  reception: () => {
    const dbUrl = provision('reception_test');
    run('node', ['scripts/run-review-regressions.cjs', 'reception'], { env: { ...process.env, TEST_DATABASE_URL: dbUrl.href } });
  },
  phase456: () => {
    const dbUrl = provision('phase456_test');
    run('node', ['scripts/run-review-regressions.cjs', 'phase456'], { env: { ...process.env, TEST_DATABASE_URL: dbUrl.href } });
  },
  complete: () => {
    const dbUrl = provision('complete_test');
    run('node', ['scripts/test-complete-review.cjs'], {
      env: { ...process.env, TEST_DATABASE_URL: dbUrl.href, TEST_APP_DATABASE_URL: appUrl('complete_test').href },
    });
  },
};

function main() {
  const requested = process.argv[2] || 'all';
  const keys = requested === 'all' ? Object.keys(SUITES) : [requested];
  const bad = keys.filter((k) => !SUITES[k]);
  if (bad.length) throw new Error(`Unknown suite(s): ${bad.join(', ')} - choose from ${Object.keys(SUITES).join(', ')}, all`);

  acquireLock();
  try {
    // Sequential on purpose: each suite reuses the one admin connection and
    // its own fixed database name, so nothing here may run concurrently
    // with itself - that's the exact race this script exists to prevent.
    for (const key of keys) {
      console.log(`\n=== ${key} ===`);
      SUITES[key]();
    }
  } finally {
    releaseLock();
  }
}

main();
