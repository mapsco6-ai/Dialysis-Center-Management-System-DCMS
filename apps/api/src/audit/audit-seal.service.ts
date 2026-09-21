import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createHash } from "crypto";
import { AuditLog } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const SEAL_INTERVAL_MS = 5_000;
const BATCH = 500;
// Arbitrary constant: only one instance seals at a time.
const SEAL_LOCK_KEY = 74_210_001;

// Tamper-evident chain over the audit log. Each audit row gets an insert-only
// AuditSeal whose hash covers the row's content and the previous seal's hash.
// Editing or deleting a sealed row (or removing a seal) outside the app breaks
// the chain and is reported by verify(). Sealing runs shortly AFTER commit
// instead of inside every business transaction, so a global lock never sits
// in the write path of clinical operations - the gap between an audit row and
// its seal is a few seconds. ponytail: rows in that gap are not yet covered.
@Injectable()
export class AuditSealService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditSealService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Tests drive sealing explicitly (see verify()).
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => this.seal().catch((e) => this.logger.error(`seal failed: ${e}`)), SEAL_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  static hashOf(row: AuditLog, prevHash: string | null): string {
    const canonical = JSON.stringify([
      prevHash,
      row.seq,
      row.id,
      row.actorId,
      row.actorRole,
      row.action,
      row.entityType,
      row.entityId,
      row.oldValue,
      row.newValue,
      row.reason,
      row.patientId,
      row.sessionId,
      row.createdAt.toISOString(),
    ]);
    return createHash("sha256").update(canonical).digest("hex");
  }

  // Seals every unsealed row in insert order. Returns how many were sealed.
  async seal(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${SEAL_LOCK_KEY}) AS locked`;
      if (!locked) return 0;

      let sealed = 0;
      for (;;) {
        const last = await tx.auditSeal.findFirst({ orderBy: { seq: "desc" } });
        const rows = await tx.auditLog.findMany({
          where: { seal: null, ...(last ? { seq: { gt: last.seq } } : {}) },
          orderBy: { seq: "asc" },
          take: BATCH,
        });
        if (rows.length === 0) return sealed;

        let prev = last?.hash ?? null;
        const seals = rows.map((row) => {
          const hash = AuditSealService.hashOf(row, prev);
          const seal = { auditLogId: row.id, seq: row.seq, prevHash: prev, hash };
          prev = hash;
          return seal;
        });
        await tx.auditSeal.createMany({ data: seals });
        sealed += seals.length;
      }
    });
  }

  // Seals anything pending, then re-walks the whole chain.
  async verify() {
    await this.seal();
    let checked = 0;
    let prev: string | null = null;
    let cursor: number | undefined;
    for (;;) {
      const seals = await this.prisma.auditSeal.findMany({
        where: cursor === undefined ? {} : { seq: { gt: cursor } },
        orderBy: { seq: "asc" },
        take: BATCH,
        include: { auditLog: true },
      });
      if (seals.length === 0) break;
      for (const seal of seals) {
        if (seal.prevHash !== prev) {
          return { ok: false, checked, brokenAtSeq: seal.seq, reason: "chain link missing or altered" };
        }
        if (AuditSealService.hashOf(seal.auditLog, seal.prevHash) !== seal.hash) {
          return { ok: false, checked, brokenAtSeq: seal.seq, reason: "audit row content changed after sealing" };
        }
        prev = seal.hash;
        cursor = seal.seq;
        checked++;
      }
    }
    return { ok: true, checked };
  }
}
