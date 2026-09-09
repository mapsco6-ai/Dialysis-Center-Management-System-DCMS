import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { MachineStatus, MaintenanceTicket, MaintenanceTicketStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MachinesService } from "../machines/machines.service";
import { MinioService } from "../storage/minio.service";
import { toAuthenticatedUser, USER_WITH_ROLES_INCLUDE } from "../auth/auth.utils";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ReportFaultDto } from "./dto/report-fault.dto";
import { AssignTicketDto } from "./dto/assign-ticket.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { CloseTicketDto } from "./dto/close-ticket.dto";

type PrismaTx = Prisma.TransactionClient;

export interface UploadedAttachment {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

const TICKET_INCLUDE = {
  machine: true,
  reportedBy: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, fullName: true } },
} satisfies Prisma.MaintenanceTicketInclude;

// A machine "actively serving a patient" at the moment a fault was
// reported - closing the ticket routes through WAITING_CLEANING for these,
// straight to AVAILABLE otherwise (see MaintenanceTicket.preFaultStatus).
const ACTIVE_USE_STATUSES: MachineStatus[] = ["IN_USE", "RESERVED", "EMERGENCY_RESERVED"];

// Every forward move except the ticket's own creation (OPEN, implicit) and
// the two side-effect-bearing transitions with their own dedicated
// endpoints: ASSIGNED (always carries an assignee) and CLOSED (always
// returns the machine to service). WAITING_PART is optional, not
// mandatory - a repair with no part to wait for goes straight from
// IN_PROGRESS to COMPLETED, which is still "no skipped stages" in the
// sense the docs care about (docs/PROJECT-PHASES-PLAN.md Phase 12
// acceptance criterion 2): nothing ever jumps past ASSIGNED or COMPLETED.
const ALLOWED_TICKET_TRANSITIONS: Partial<Record<MaintenanceTicketStatus, MaintenanceTicketStatus[]>> = {
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING_PART", "COMPLETED"],
  WAITING_PART: ["IN_PROGRESS", "COMPLETED"],
};

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly machinesService: MachinesService,
    private readonly minioService: MinioService,
  ) {}

  private async requireTicket(id: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException("Maintenance ticket not found");
    }
    return ticket;
  }

  // Same append-only choke-point pattern as MachinesService.transitionStatus
  // - every ticket status change routes through here so
  // MaintenanceTicketStatusHistory (half of the Machine Timeline) can never
  // miss an entry.
  private async transitionTicketStatus(
    tx: PrismaTx,
    ticket: Pick<MaintenanceTicket, "id" | "status">,
    toStatus: MaintenanceTicketStatus,
    actor: AuthenticatedUser,
    reason?: string,
  ) {
    await tx.maintenanceTicket.update({ where: { id: ticket.id }, data: { status: toStatus } });
    await tx.maintenanceTicketStatusHistory.create({
      data: {
        ticketId: ticket.id,
        fromStatus: ticket.status,
        toStatus,
        changedById: actor.id,
        reason,
      },
    });
  }

  // REPORT FAULT: flips Machine.status -> OUT_OF_SERVICE and creates the
  // ticket in one transaction (docs/MODULES-SPEC.md: "ينقل ... تلقائياً ضمن
  // نفس Transaction - لا يُترك يدوياً"), via the same central
  // MachinesService.transitionStatus() every other phase already uses.
  async reportFault(dto: ReportFaultDto, file: UploadedAttachment | undefined, actor: AuthenticatedUser) {
    const machine = await this.prisma.machine.findUnique({ where: { id: dto.machineId } });
    if (!machine) {
      throw new BadRequestException("Machine not found");
    }
    if (machine.status === "OUT_OF_SERVICE") {
      throw new ConflictException("Machine is already OUT_OF_SERVICE");
    }

    // Uploaded before the transaction opens (MinIO isn't part of it and
    // can't roll back) - if the transaction below fails anyway, the catch
    // removes this orphaned object rather than leaving it behind forever
    // (docs review DCMS-003's lesson: never leave an unaudited/orphaned
    // resource on a failure that was cheap to avoid).
    let attachmentUrl: string | undefined;
    if (file) {
      attachmentUrl = await this.minioService.upload(file.buffer, file.originalname, file.mimetype);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.machinesService.transitionStatus(tx, machine, "OUT_OF_SERVICE", actor, `Fault reported: ${dto.problem}`);

        const ticket = await tx.maintenanceTicket.create({
          data: {
            machineId: machine.id,
            reportedById: actor.id,
            problem: dto.problem,
            severity: dto.severity,
            attachmentUrl,
            preFaultStatus: machine.status,
          },
        });

        await this.auditService.log(
          {
            actorId: actor.id,
            actorRole: actor.roles[0] ?? "UNKNOWN",
            action: "MAINTENANCE_FAULT_REPORTED",
            entityType: "MaintenanceTicket",
            entityId: ticket.id,
            newValue: { machineId: machine.id, problem: dto.problem, severity: dto.severity, hasAttachment: !!attachmentUrl },
          },
          tx,
        );

        return tx.maintenanceTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: TICKET_INCLUDE });
      });
    } catch (error) {
      if (attachmentUrl) {
        await this.minioService.remove(attachmentUrl);
      }
      throw error;
    }
  }

  // Someone assigning a ticket needs to pick from maintenance-capable staff
  // without needing the much broader user.view permission just to populate
  // a dropdown (same reasoning as AssignmentsService.listNurseCandidates).
  // Filters by the actual permission, not a role name, so it stays correct
  // if a center grants maintenance.manage to a role other than MAINTENANCE.
  async listStaff() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      include: USER_WITH_ROLES_INCLUDE,
    });
    return users
      .filter((u) => toAuthenticatedUser(u).permissions.includes("maintenance.manage"))
      .map((u) => ({ id: u.id, fullName: u.fullName }));
  }

  async listTickets(status?: MaintenanceTicketStatus, machineId?: string) {
    return this.prisma.maintenanceTicket.findMany({
      where: { ...(status ? { status } : {}), ...(machineId ? { machineId } : {}) },
      include: TICKET_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({
      where: { id },
      include: { ...TICKET_INCLUDE, statusHistory: { include: { changedBy: { select: { id: true, fullName: true } } }, orderBy: { changedAt: "asc" } } },
    });
    if (!ticket) {
      throw new NotFoundException("Maintenance ticket not found");
    }
    return ticket;
  }

  async getAttachment(id: string) {
    const ticket = await this.requireTicket(id);
    if (!ticket.attachmentUrl) {
      throw new NotFoundException("This ticket has no attachment");
    }
    return this.minioService.getObject(ticket.attachmentUrl);
  }

  // OPEN -> ASSIGNED is the only path into ASSIGNED, and always carries a
  // real assignee, not just a status flip.
  async assign(id: string, dto: AssignTicketDto, actor: AuthenticatedUser) {
    const ticket = await this.requireTicket(id);
    if (ticket.status !== "OPEN") {
      throw new ConflictException(`Cannot assign a ticket that is ${ticket.status}`);
    }

    // An id that merely exists proves nothing - without this, any active
    // account could be attributed as the assignee regardless of whether
    // they actually do maintenance work (same DCMS-054/056 reasoning
    // applied here).
    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assignedToId },
      include: USER_WITH_ROLES_INCLUDE,
    });
    if (!assignee || !assignee.isActive) {
      throw new BadRequestException("assignedToId does not refer to an active user");
    }
    if (!toAuthenticatedUser(assignee).permissions.includes("maintenance.manage")) {
      throw new BadRequestException("assignedToId does not hold maintenance authority");
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.maintenanceTicket.updateMany({
        where: { id, status: "OPEN" },
        data: { status: "ASSIGNED", assignedToId: dto.assignedToId },
      });
      if (result.count === 0) {
        throw new ConflictException("This ticket's status changed since it was read");
      }
      await tx.maintenanceTicketStatusHistory.create({
        data: { ticketId: id, fromStatus: "OPEN", toStatus: "ASSIGNED", changedById: actor.id },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "MAINTENANCE_TICKET_ASSIGNED",
          entityType: "MaintenanceTicket",
          entityId: id,
          newValue: { assignedToId: dto.assignedToId },
        },
        tx,
      );

      return tx.maintenanceTicket.findUniqueOrThrow({ where: { id }, include: TICKET_INCLUDE });
    });
  }

  async updateStatus(id: string, dto: UpdateTicketStatusDto, actor: AuthenticatedUser) {
    const ticket = await this.requireTicket(id);
    const allowed = ALLOWED_TICKET_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Cannot go directly from ${ticket.status} to ${dto.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic and conditional on the status being unchanged since it was
      // read - closes a concurrent double-transition race (same pattern as
      // the Phase 3 check-in fix).
      const result = await tx.maintenanceTicket.updateMany({
        where: { id, status: ticket.status },
        data: { status: dto.status },
      });
      if (result.count === 0) {
        throw new ConflictException("This ticket's status changed since it was read");
      }
      await tx.maintenanceTicketStatusHistory.create({
        data: { ticketId: id, fromStatus: ticket.status, toStatus: dto.status, changedById: actor.id, reason: dto.reason },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "MAINTENANCE_TICKET_STATUS_CHANGED",
          entityType: "MaintenanceTicket",
          entityId: id,
          oldValue: { status: ticket.status },
          newValue: { status: dto.status },
          reason: dto.reason,
        },
        tx,
      );

      return tx.maintenanceTicket.findUniqueOrThrow({ where: { id }, include: TICKET_INCLUDE });
    });
  }

  // The only path that returns the machine to service (docs/MODULES-
  // SPEC.md: "CLOSED هو الوحيد المسموح أن يعيد الجهاز لـAVAILABLE/CLEANING").
  async close(id: string, dto: CloseTicketDto, actor: AuthenticatedUser) {
    const ticket = await this.requireTicket(id);
    if (ticket.status !== "COMPLETED") {
      throw new ConflictException(`Cannot close a ticket that is ${ticket.status} - it must be COMPLETED first`);
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.maintenanceTicket.updateMany({
        where: { id, status: "COMPLETED" },
        data: { status: "CLOSED" },
      });
      if (result.count === 0) {
        throw new ConflictException("This ticket's status changed since it was read");
      }
      await tx.maintenanceTicketStatusHistory.create({
        data: { ticketId: id, fromStatus: "COMPLETED", toStatus: "CLOSED", changedById: actor.id, reason: dto.reason },
      });

      // Another still-open ticket on the same machine (a second, unrelated
      // fault reported while this one was being worked) means the machine
      // genuinely isn't fixed yet - closing this ticket must not reactivate
      // it out from under the other one.
      const otherOpenTicket = await tx.maintenanceTicket.findFirst({
        where: { machineId: ticket.machineId, status: { not: "CLOSED" }, id: { not: id } },
        select: { id: true },
      });
      if (!otherOpenTicket) {
        const freshMachine = await tx.machine.findUniqueOrThrow({ where: { id: ticket.machineId } });
        if (freshMachine.status === "OUT_OF_SERVICE") {
          const returnStatus: MachineStatus = ACTIVE_USE_STATUSES.includes(ticket.preFaultStatus)
            ? "WAITING_CLEANING"
            : "AVAILABLE";
          await this.machinesService.transitionStatus(
            tx,
            freshMachine,
            returnStatus,
            actor,
            dto.reason ?? "Maintenance ticket closed",
          );
        }
      }

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "MAINTENANCE_TICKET_CLOSED",
          entityType: "MaintenanceTicket",
          entityId: id,
          newValue: { status: "CLOSED", machineReturnedToService: !otherOpenTicket },
          reason: dto.reason,
        },
        tx,
      );

      return tx.maintenanceTicket.findUniqueOrThrow({ where: { id }, include: TICKET_INCLUDE });
    });
  }

  // --- Machine Timeline & Downtime --------------------------------------

  private categorize(toStatus: MachineStatus): "USAGE" | "CLEANING" | "FAULT" | "RETURN_TO_SERVICE" | "OTHER" {
    switch (toStatus) {
      case "IN_USE":
        return "USAGE";
      case "CLEANING":
      case "WAITING_CLEANING":
        return "CLEANING";
      case "OUT_OF_SERVICE":
        return "FAULT";
      case "AVAILABLE":
        return "RETURN_TO_SERVICE";
      default:
        return "OTHER";
    }
  }

  // Merges the two append-only ledgers that together make up the Machine
  // Timeline (docs/PROJECT-PHASES-PLAN.md Phase 12 acceptance criterion 4:
  // "استخدام، تعفير، عطل، صيانة، عودة خدمة"): MachineStatusHistory covers
  // usage/cleaning/fault/return-to-service, MaintenanceTicketStatusHistory
  // covers the repair work itself ("صيانة") that never touches
  // Machine.status while it's happening.
  async getMachineTimeline(machineId: string) {
    const machine = await this.prisma.machine.findUnique({ where: { id: machineId }, select: { id: true } });
    if (!machine) {
      throw new NotFoundException("Machine not found");
    }

    const [statusHistory, ticketHistory] = await Promise.all([
      this.prisma.machineStatusHistory.findMany({
        where: { machineId },
        include: { changedBy: { select: { id: true, fullName: true } } },
        orderBy: { changedAt: "asc" },
      }),
      this.prisma.maintenanceTicketStatusHistory.findMany({
        where: { ticket: { machineId } },
        include: { changedBy: { select: { id: true, fullName: true } }, ticket: { select: { id: true, problem: true } } },
        orderBy: { changedAt: "asc" },
      }),
    ]);

    const events = [
      ...statusHistory.map((h) => ({
        timestamp: h.changedAt,
        category: this.categorize(h.toStatus),
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedBy: h.changedBy,
        reason: h.reason,
        source: "MACHINE_STATUS" as const,
        ticketId: null as string | null,
      })),
      ...ticketHistory.map((h) => ({
        timestamp: h.changedAt,
        category: "MAINTENANCE" as const,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedBy: h.changedBy,
        reason: h.reason,
        source: "MAINTENANCE_TICKET" as const,
        ticketId: h.ticketId,
      })),
    ];
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return events;
  }

  // Downtime = actual elapsed time the machine sat OUT_OF_SERVICE until it
  // was truly AVAILABLE again (docs/PROJECT-PHASES-PLAN.md Phase 12
  // acceptance criterion 6) - including any cleaning time in between, since
  // a machine mid-cleaning still isn't usable by a patient. Computed
  // directly from the append-only MachineStatusHistory ledger, clipped to
  // [from, to], with an interval still open at `to` counted as ongoing.
  async getDowntimeReport(machineId: string, fromStr: string, toStr: string) {
    const machine = await this.prisma.machine.findUnique({ where: { id: machineId }, select: { id: true } });
    if (!machine) {
      throw new NotFoundException("Machine not found");
    }
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (from >= to) {
      throw new BadRequestException("`from` must be before `to`");
    }

    const history = await this.prisma.machineStatusHistory.findMany({
      where: { machineId, changedAt: { lte: to } },
      orderBy: { changedAt: "asc" },
    });

    let totalDowntimeMs = 0;
    const intervals: { start: Date; end: Date }[] = [];
    let downSince: Date | null = null;
    for (const event of history) {
      if (event.toStatus === "OUT_OF_SERVICE") {
        downSince ??= event.changedAt;
      } else if (event.toStatus === "AVAILABLE" && downSince) {
        const start = downSince > from ? downSince : from;
        const end = event.changedAt < to ? event.changedAt : to;
        if (end > start) {
          totalDowntimeMs += end.getTime() - start.getTime();
          intervals.push({ start, end });
        }
        downSince = null;
      }
    }
    // Still down at the end of the window - count the ongoing portion.
    if (downSince) {
      const start = downSince > from ? downSince : from;
      if (to > start) {
        totalDowntimeMs += to.getTime() - start.getTime();
        intervals.push({ start, end: to, ongoing: true } as { start: Date; end: Date; ongoing?: boolean });
      }
    }

    return {
      machineId,
      from: from.toISOString(),
      to: to.toISOString(),
      totalDowntimeMs,
      totalDowntimeHours: totalDowntimeMs / 3_600_000,
      intervals,
    };
  }
}
