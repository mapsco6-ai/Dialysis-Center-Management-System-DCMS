import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditFilterDto } from "./dto/audit-filter.dto";

export interface AuditLogInput {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  device?: string;
  ipAddress?: string;
  patientId?: string;
  sessionId?: string;
}

// Accepts either the plain PrismaService or an interactive-transaction
// client, so callers can bundle the audit write atomically with the entity
// change it's documenting (docs review DCMS-003: a crash between "save the
// change" and "log the change" must never happen).
type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const EXPORT_ROW_CAP = 50000;

const ACTOR_SELECT = { select: { id: true, username: true, fullName: true } } as const;

// patient/session context is derived when the caller didn't pass it, so every
// existing audit call site becomes findable per patient without editing them.
function contextOf(input: AuditLogInput) {
  const value = input.newValue as { patientId?: unknown; sessionId?: unknown } | null | undefined;
  const patientId =
    input.patientId ??
    (input.entityType === "Patient" ? input.entityId : typeof value?.patientId === "string" ? value.patientId : undefined);
  const sessionId =
    input.sessionId ??
    (input.entityType === "DialysisSession" ? input.entityId : typeof value?.sessionId === "string" ? value.sessionId : undefined);
  return { patientId, sessionId };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Leading = + - @ would be executed as a formula when opened in Excel.
  const safe = /^[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput, client: PrismaClientOrTx = this.prisma) {
    return client.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValue: input.oldValue as any,
        newValue: input.newValue as any,
        reason: input.reason,
        device: input.device,
        ipAddress: input.ipAddress,
        ...contextOf(input),
      },
    });
  }

  private where(filter: AuditFilterDto): Prisma.AuditLogWhereInput {
    return {
      actorId: filter.actorId,
      patientId: filter.patientId,
      action: filter.action,
      entityType: filter.entityType,
      ...(filter.from || filter.to
        ? { createdAt: { gte: filter.from ? new Date(filter.from) : undefined, lte: filter.to ? new Date(filter.to) : undefined } }
        : {}),
    };
  }

  // Page-numbered, filterable view for the oversight screens (the cursor
  // findAll above stays for the plain scroll-back feed).
  async search(filter: AuditFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? DEFAULT_PAGE_SIZE;
    const where = this.where(filter);
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: ACTOR_SELECT },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total };
  }

  // One person's activity plus a per-action tally for the same window - the
  // daily "what did this employee do" record committees ask for.
  async activity(actorId: string, filter: AuditFilterDto) {
    const scoped = { ...filter, actorId };
    const [{ data, total }, tally] = await Promise.all([
      this.search(scoped),
      this.prisma.auditLog.groupBy({ by: ["action"], where: this.where(scoped), _count: { _all: true }, orderBy: { _count: { action: "desc" } } }),
    ]);
    return { data, total, summary: tally.map((row) => ({ action: row.action, count: row._count._all })) };
  }

  async retentionStats(cutoff: Date) {
    const [total, olderThanCutoff, oldest] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.auditLog.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    ]);
    return { total, olderThanCutoff, oldestAt: oldest?.createdAt ?? null };
  }

  // Everything that touched one patient (changes AND chart openings).
  patientHistory(patientId: string, filter: AuditFilterDto) {
    return this.search({ ...filter, patientId });
  }

  async exportCsv(filter: AuditFilterDto): Promise<string> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.where(filter),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EXPORT_ROW_CAP,
      include: { actor: ACTOR_SELECT },
    });
    const header = ["time", "actor", "username", "role", "action", "entityType", "entityId", "patientId", "sessionId", "reason", "device", "ip", "oldValue", "newValue"];
    const lines = rows.map((r) =>
      [r.createdAt.toISOString(), r.actor.fullName, r.actor.username, r.actorRole, r.action, r.entityType, r.entityId, r.patientId, r.sessionId, r.reason, r.device, r.ipAddress, r.oldValue, r.newValue]
        .map(csvCell)
        .join(","),
    );
    return "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  }

  // Cursor-paginated (createdAt desc, id desc as tiebreaker) with a hard cap,
  // so a years-old audit trail can never be pulled back in one unbounded
  // response (docs review DCMS-007).
  async findAll(options: { limit?: number; cursor?: string } = {}) {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const logs = await this.prisma.auditLog.findMany({
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { actor: { select: { id: true, username: true, fullName: true } } },
    });

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    return {
      data: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
