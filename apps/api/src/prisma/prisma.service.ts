import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // The running server connects with a restricted DB role (APP_DATABASE_URL)
    // that has UPDATE/DELETE revoked on audit_logs and DELETE revoked on
    // patient medical history tables (see prisma/harden-db.sql) - so even a
    // bug or a compromised process can't silently rewrite history at the
    // application layer. Prisma CLI commands (migrate/seed) keep using the
    // full-privilege DATABASE_URL to actually create/alter those tables.
    // Falls back to DATABASE_URL when APP_DATABASE_URL isn't set (local dev
    // with a single Postgres user).
    const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
    super({ datasources: { db: { url } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
