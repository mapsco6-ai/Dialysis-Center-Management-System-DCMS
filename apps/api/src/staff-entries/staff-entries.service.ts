import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { IncidentType, Prisma, StaffEntryStatus } from "@prisma/client";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { emitNotification } from "../common/notify";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { IncidentsService } from "../quality/incidents.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateStaffEntryDto } from "./dto/create-staff-entry.dto";
import { ListStaffEntriesQueryDto } from "./dto/list-staff-entries-query.dto";
import { UpdateStaffEntryStatusDto } from "./dto/review-staff-entry.dto";

// Same shape as maintenance tickets/incidents: forward-only, RESOLVED may be
// reopened, CLOSED and REJECTED are final.
export const ALLOWED_ENTRY_TRANSITIONS: Partial<Record<StaffEntryStatus, StaffEntryStatus[]>> = {
  SUBMITTED: ["ACKNOWLEDGED", "IN_PROGRESS", "REJECTED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "RESOLVED", "REJECTED"],
  IN_PROGRESS: ["RESOLVED", "REJECTED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
};

const PERSON = { select: { id: true, username: true, fullName: true } } as const;

const ENTRY_INCLUDE = {
  author: PERSON,
  assignedTo: PERSON,
  history: {
    include: { changedBy: { select: { id: true, fullName: true } } },
    orderBy: { changedAt: "asc" as const },
  },
} satisfies Prisma.StaffEntryInclude;

const isReviewer = (user: AuthenticatedUser) => user.permissions.includes("entry.review");

@Injectable()
export class StaffEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly incidentsService: IncidentsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private actor(user: AuthenticatedUser) {
    return { actorId: user.id, actorRole: user.roles[0] ?? "UNKNOWN", entityType: "StaffEntry" };
  }

  async create(dto: CreateStaffEntryDto, user: AuthenticatedUser) {
    const checks: [string, string | undefined, () => Promise<unknown>][] = [
      ["patientId", dto.patientId, () => this.prisma.patient.findUnique({ where: { id: dto.patientId } })],
      ["sessionId", dto.sessionId, () => this.prisma.dialysisSession.findUnique({ where: { id: dto.sessionId } })],
      ["machineId", dto.machineId, () => this.prisma.machine.findUnique({ where: { id: dto.machineId } })],
      ["shiftId", dto.shiftId, () => this.prisma.shift.findUnique({ where: { id: dto.shiftId } })],
    ];
    for (const [field, value, lookup] of checks) {
      if (value && !(await lookup())) throw new BadRequestException(`${field} does not refer to an existing record`);
    }
    if (dto.complaintSource && dto.type !== "COMPLAINT") {
      throw new BadRequestException("complaintSource only applies to COMPLAINT entries");
    }

    // Complaints (from staff, patients or families) go straight to the
    // center director's desk; anything else waits in the general review queue.
    const director =
      dto.type === "COMPLAINT"
        ? await this.prisma.user.findFirst({
            where: { isActive: true, roles: { some: { role: { name: "CENTER_DIRECTOR" } } } },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          })
        : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.staffEntry.create({
        data: {
          ...dto,
          assignedToId: director?.id,
          authorId: user.id,
          complaintSource: dto.type === "COMPLAINT" ? (dto.complaintSource ?? "STAFF") : undefined,
        },
        include: ENTRY_INCLUDE,
      });
      await tx.staffEntryStatusHistory.create({
        data: { entryId: entry.id, toStatus: "SUBMITTED", changedById: user.id },
      });
      // Confidential text stays out of the (widely readable) audit log.
      await this.auditService.log(
        {
          ...this.actor(user),
          action: "STAFF_ENTRY_CREATED",
          entityId: entry.id,
          patientId: dto.patientId,
          sessionId: dto.sessionId,
          newValue: {
            type: dto.type,
            category: dto.category,
            severity: entry.severity,
            title: dto.isConfidential ? undefined : dto.title,
          },
        },
        tx,
      );
      return entry;
    });

    if (dto.type === "COMPLAINT" || dto.severity === "HIGH" || dto.severity === "CRITICAL") {
      emitNotification(this.eventEmitter, {
        userIds: director ? [director.id] : [],
        permission: "entry.review",
        excludeUserId: user.id,
        type: dto.type === "COMPLAINT" ? "COMPLAINT_FILED" : "STAFF_ENTRY_URGENT",
        // Confidential text never leaves the entry itself.
        title: dto.isConfidential ? "Confidential entry submitted" : dto.title,
        titleAr: dto.isConfidential ? "تم تقديم بلاغ سري" : dto.title,
        link: "/admin/people/entries",
      });
    }
    return created;
  }

  listMine(user: AuthenticatedUser, query: ListStaffEntriesQueryDto) {
    return this.list({ ...query, authorId: user.id });
  }

  async list(query: ListStaffEntriesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.StaffEntryWhereInput = {
      type: query.type,
      status: query.status,
      authorId: query.authorId,
      patientId: query.patientId,
      ...(query.from || query.to
        ? { entryDate: { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.staffEntry.findMany({
        where,
        orderBy: [{ entryDate: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: { author: PERSON, assignedTo: PERSON },
      }),
      this.prisma.staffEntry.count({ where }),
    ]);
    return { data, total };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const entry = await this.prisma.staffEntry.findUnique({ where: { id }, include: ENTRY_INCLUDE });
    // 404 (not 403) for someone else's entry so its existence isn't revealed.
    if (!entry || (entry.authorId !== user.id && !isReviewer(user))) {
      throw new NotFoundException("Entry not found");
    }
    return entry;
  }

  async updateStatus(id: string, dto: UpdateStaffEntryStatusDto, user: AuthenticatedUser) {
    const entry = await this.prisma.staffEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("Entry not found");
    if (!(ALLOWED_ENTRY_TRANSITIONS[entry.status] ?? []).includes(dto.status)) {
      throw new BadRequestException(`Cannot move an entry from ${entry.status} to ${dto.status}`);
    }
    if (dto.status === "REJECTED" && !dto.reason) {
      throw new BadRequestException("A reason is required when rejecting an entry");
    }

    return this.prisma.$transaction(async (tx) => {
      // The status in the WHERE closes a concurrent double-transition race.
      const moved = await tx.staffEntry.updateMany({
        where: { id, status: entry.status },
        data: {
          status: dto.status,
          ...(dto.response ? { response: dto.response, respondedAt: new Date() } : {}),
        },
      });
      if (moved.count === 0) throw new BadRequestException("Entry status changed concurrently - reload and retry");
      await tx.staffEntryStatusHistory.create({
        data: { entryId: id, fromStatus: entry.status, toStatus: dto.status, changedById: user.id, reason: dto.reason },
      });
      await this.auditService.log(
        {
          ...this.actor(user),
          action: "STAFF_ENTRY_STATUS_CHANGED",
          entityId: id,
          patientId: entry.patientId ?? undefined,
          oldValue: { status: entry.status },
          newValue: { status: dto.status },
          reason: dto.reason,
        },
        tx,
      );
      return tx.staffEntry.findUniqueOrThrow({ where: { id }, include: ENTRY_INCLUDE });
    });
  }

  async assign(id: string, assignedToId: string, user: AuthenticatedUser) {
    const [entry, assignee] = await Promise.all([
      this.prisma.staffEntry.findUnique({ where: { id } }),
      this.prisma.user.findUnique({ where: { id: assignedToId } }),
    ]);
    if (!entry) throw new NotFoundException("Entry not found");
    if (!assignee || !assignee.isActive) throw new BadRequestException("assignedToId must be an active user");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffEntry.update({ where: { id }, data: { assignedToId }, include: ENTRY_INCLUDE });
      await this.auditService.log(
        {
          ...this.actor(user),
          action: "STAFF_ENTRY_ASSIGNED",
          entityId: id,
          oldValue: { assignedToId: entry.assignedToId },
          newValue: { assignedToId },
        },
        tx,
      );
      return updated;
    });
  }

  // Turns a report into a formal safety incident. The incident is created by
  // the existing IncidentsService (so it gets its own history/validation);
  // the entry just remembers the link.
  async escalate(id: string, incidentType: IncidentType, user: AuthenticatedUser) {
    const entry = await this.prisma.staffEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("Entry not found");
    if (entry.escalatedIncidentId) throw new BadRequestException("Entry was already escalated");
    if (!entry.patientId && !entry.sessionId && !entry.machineId) {
      throw new BadRequestException("Only entries linked to a patient, session or machine can be escalated");
    }
    const incident = await this.incidentsService.create(
      {
        patientId: entry.patientId ?? undefined,
        sessionId: entry.sessionId ?? undefined,
        machineId: entry.machineId ?? undefined,
        type: incidentType,
        severity: entry.severity,
        description: `[${entry.title}] ${entry.body}`,
      },
      user,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.staffEntry.update({ where: { id }, data: { escalatedIncidentId: incident.id } });
      await this.auditService.log(
        { ...this.actor(user), action: "STAFF_ENTRY_ESCALATED", entityId: id, newValue: { incidentId: incident.id } },
        tx,
      );
    });
    return { entryId: id, incidentId: incident.id };
  }

  // Auto-built end-of-shift summary the employee attaches a comment to,
  // so a report is one click instead of memory work.
  async shiftSummary(user: AuthenticatedUser, date?: string) {
    const day = date ? new Date(date) : new Date();
    if (Number.isNaN(day.getTime())) throw new BadRequestException("date must be a valid date");
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const inDay = { gte: start, lt: end };

    const [actions, sessionsNursed, readingsEntered, eventsRecorded, entriesWritten] = await Promise.all([
      this.prisma.auditLog.groupBy({
        by: ["action"],
        where: { actorId: user.id, createdAt: inDay },
        _count: { _all: true },
        orderBy: { _count: { action: "desc" } },
      }),
      this.prisma.dialysisSession.count({ where: { nurseId: user.id, createdAt: inDay } }),
      this.prisma.dialysisReading.count({ where: { enteredById: user.id, createdAt: inDay } }),
      this.prisma.dialysisEvent.count({ where: { recordedById: user.id, recordedAt: inDay } }),
      this.prisma.staffEntry.count({ where: { authorId: user.id, createdAt: inDay } }),
    ]);
    return {
      date: start.toISOString().slice(0, 10),
      actions: actions.map((row) => ({ action: row.action, count: row._count._all })),
      sessionsNursed,
      readingsEntered,
      eventsRecorded,
      entriesWritten,
    };
  }
}
