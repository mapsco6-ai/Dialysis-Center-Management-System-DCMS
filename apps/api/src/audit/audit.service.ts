import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

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
}

// Accepts either the plain PrismaService or an interactive-transaction
// client, so callers can bundle the audit write atomically with the entity
// change it's documenting (docs review DCMS-003: a crash between "save the
// change" and "log the change" must never happen).
type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

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
      },
    });
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
