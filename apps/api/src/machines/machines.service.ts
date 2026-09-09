import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Machine, MachineStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateMachineDto } from "./dto/create-machine.dto";
import { UpdateMachineStatusDto } from "./dto/update-machine-status.dto";
import { AssignMachineDto } from "./dto/assign-machine.dto";
import { DecideApprovalDto } from "./dto/decide-approval.dto";
import { RequestApprovalDto } from "./dto/request-approval.dto";
import { isUniqueConstraintOn } from "../patients/prisma-errors.util";

type PrismaTx = Prisma.TransactionClient;

// Statuses reachable through the generic status endpoint - see the DTO
// comment for why IN_USE/RESERVED/EMERGENCY_RESERVED/APPROVAL_REQUIRED are
// excluded here.
const GENERIC_STATUSES: MachineStatus[] = ["AVAILABLE", "CLEANING", "WAITING_CLEANING", "MAINTENANCE", "OUT_OF_SERVICE"];

// Which generic status each generic status may move to directly - in
// particular, WAITING_CLEANING can only reach AVAILABLE via CLEANING, never
// straight across (docs review DCMS-046; docs/PROJECT-PHASES-PLAN.md Phase 6
// acceptance criterion 6: "لا يظهر متاحاً حتى تُغلق CLEANING"). OUT_OF_SERVICE
// is reachable from anywhere (handled separately, above this table) as the
// equipment-failure escape hatch.
const ALLOWED_GENERIC_TRANSITIONS: Partial<Record<MachineStatus, MachineStatus[]>> = {
  AVAILABLE: ["MAINTENANCE", "OUT_OF_SERVICE"],
  CLEANING: ["AVAILABLE", "OUT_OF_SERVICE"],
  WAITING_CLEANING: ["CLEANING", "OUT_OF_SERVICE"],
  MAINTENANCE: ["AVAILABLE", "OUT_OF_SERVICE"],
  OUT_OF_SERVICE: ["AVAILABLE", "MAINTENANCE"],
};

@Injectable()
export class MachinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async requireMachine(id: string) {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) {
      throw new NotFoundException("Machine not found");
    }
    return machine;
  }

  // The one place any Machine.status ever changes - every caller (in this
  // service, and SessionsService for the IN_USE/WAITING_CLEANING/
  // OUT_OF_SERVICE transitions Phase 6 drives) routes through it, so
  // MachineStatusHistory can never miss an entry (docs/MODULES-SPEC.md:
  // "يجب أن يمر عبر خدمة واحدة مركزية"). Deliberately not private: it stays
  // the single choke point, just not limited to callers within this file.
  async transitionStatus(
    tx: PrismaTx,
    machine: Pick<Machine, "id" | "status">,
    toStatus: MachineStatus,
    actor: AuthenticatedUser,
    reason: string,
  ) {
    await tx.machine.update({ where: { id: machine.id }, data: { status: toStatus } });
    await tx.machineStatusHistory.create({
      data: {
        machineId: machine.id,
        fromStatus: machine.status,
        toStatus,
        changedById: actor.id,
        reason,
      },
    });
  }

  async create(dto: CreateMachineDto, actor: AuthenticatedUser) {
    const ward = await this.prisma.ward.findUnique({ where: { id: dto.wardId } });
    if (!ward) {
      throw new BadRequestException("Ward not found");
    }

    try {
      const machine = await this.prisma.machine.create({
        data: {
          machineCode: dto.machineCode,
          wardId: dto.wardId,
          serialNumber: dto.serialNumber,
          manufacturer: dto.manufacturer,
          model: dto.model,
          isEmergencyDedicated: dto.isEmergencyDedicated ?? false,
          isProtected: dto.isProtected ?? false,
        },
      });
      await this.auditService.log({
        actorId: actor.id,
        actorRole: actor.roles[0] ?? "UNKNOWN",
        action: "MACHINE_CREATED",
        entityType: "Machine",
        entityId: machine.id,
        newValue: machine,
      });
      return machine;
    } catch (error) {
      if (isUniqueConstraintOn(error, "machineCode")) {
        throw new ConflictException("A machine with this code already exists");
      }
      throw error;
    }
  }

  async findAll(status?: MachineStatus) {
    return this.prisma.machine.findMany({
      where: status ? { status } : undefined,
      include: { ward: true },
      orderBy: { machineCode: "asc" },
    });
  }

  // Phase 6 integration point: if a DialysisSession already exists for this
  // schedule (patient has arrived and passed Pre-Dialysis), keep it in sync
  // with the machine-assignment outcome. A no-op (0 rows) when no session
  // exists yet, or the session isn't at a stage expecting a machine - which
  // keeps every Phase 5 caller (including sessions created before Phase 6
  // existed) working unchanged.
  private async syncSessionOnAssigned(tx: PrismaTx, scheduleId: string, machineId: string) {
    await tx.dialysisSession.updateMany({
      where: { scheduleId, status: { in: ["SUPPLIES_READY", "WAITING_MACHINE"] } },
      data: { machineId, status: "ASSIGNED" },
    });
  }

  private async syncSessionOnApprovalRequired(tx: PrismaTx, scheduleId: string) {
    await tx.dialysisSession.updateMany({
      where: { scheduleId, status: "SUPPLIES_READY" },
      data: { status: "WAITING_MACHINE" },
    });
  }

  async findOne(id: string) {
    const machine = await this.prisma.machine.findUnique({
      where: { id },
      include: { ward: true },
    });
    if (!machine) {
      throw new NotFoundException("Machine not found");
    }
    return machine;
  }

  async setStatus(id: string, dto: UpdateMachineStatusDto, actor: AuthenticatedUser) {
    const machine = await this.requireMachine(id);
    if (machine.status === dto.status) {
      throw new BadRequestException(`Machine is already ${dto.status}`);
    }
    // Only OUT_OF_SERVICE can interrupt a machine that's actively assigned
    // (safety exception - equipment can fail mid-session). Anything else
    // must go through the proper flow (assignment/approval/session-end),
    // never a casual reset from here.
    if (dto.status !== "OUT_OF_SERVICE" && !GENERIC_STATUSES.includes(machine.status)) {
      throw new ConflictException(
        `Cannot change status via this endpoint while the machine is ${machine.status} - it's tied to an active assignment`,
      );
    }

    // From a generic status, the target must be directly reachable - e.g.
    // WAITING_CLEANING can't jump straight to AVAILABLE, only to CLEANING
    // (docs review DCMS-046).
    if (dto.status !== "OUT_OF_SERVICE" && GENERIC_STATUSES.includes(machine.status)) {
      const allowedTargets = ALLOWED_GENERIC_TRANSITIONS[machine.status] ?? [];
      if (!allowedTargets.includes(dto.status)) {
        throw new ConflictException(`Cannot go directly from ${machine.status} to ${dto.status}`);
      }
    }

    // A machine taken OUT_OF_SERVICE by a Phase 12 fault report stays that
    // way until its own ticket is CLOSED - closing is the "الوحيد المسموح
    // أن يعيد الجهاز" (docs/MODULES-SPEC.md Phase 12), so this generic
    // endpoint must not offer a side door back to AVAILABLE/MAINTENANCE
    // while a ticket for it is still open. Reading maintenanceTicket
    // directly (no MaintenanceModule import) matches this codebase's usual
    // cross-phase data-layer coupling (e.g. Pharmacy reading Prescription).
    if (machine.status === "OUT_OF_SERVICE" && dto.status !== "OUT_OF_SERVICE") {
      const openTicket = await this.prisma.maintenanceTicket.findFirst({
        where: { machineId: id, status: { not: "CLOSED" } },
        select: { id: true },
      });
      if (openTicket) {
        throw new ConflictException(
          "This machine has an open maintenance ticket - close it to return the machine to service",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await this.transitionStatus(tx, machine, dto.status, actor, dto.reason);
      return tx.machine.findUniqueOrThrow({ where: { id }, include: { ward: true } });
    });
  }

  async getCapacitySnapshot() {
    const machines = await this.prisma.machine.findMany();
    const byStatus: Partial<Record<MachineStatus, number>> = {};
    for (const machine of machines) {
      byStatus[machine.status] = (byStatus[machine.status] ?? 0) + 1;
    }
    return {
      totalMachines: machines.length,
      availableForRegularAssignment: machines.filter(
        (m) => m.status === "AVAILABLE" && !m.isProtected && !m.isEmergencyDedicated,
      ).length,
      protectedCount: machines.filter((m) => m.isProtected).length,
      emergencyDedicatedCount: machines.filter((m) => m.isEmergencyDedicated).length,
      byStatus,
    };
  }

  // --- Assignment ----------------------------------------------------------

  async assignMachine(scheduleId: string, dto: AssignMachineDto, actor: AuthenticatedUser) {
    const schedule = await this.prisma.dialysisSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) {
      throw new NotFoundException("Schedule entry not found");
    }
    if (schedule.machineId) {
      throw new ConflictException("This session already has a machine assigned");
    }

    if (dto.machineId) {
      return this.manualAssign(schedule, dto.machineId, dto.reason as string, actor);
    }
    return this.autoAssign(schedule, actor);
  }

  private async manualAssign(
    schedule: { id: string; patientId: string; type: string },
    machineId: string,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    const machine = await this.requireMachine(machineId);
    if (machine.status !== "AVAILABLE") {
      throw new ConflictException(`Machine is ${machine.status}, not AVAILABLE`);
    }

    // Overriding straight past protection/emergency-reservation requires the
    // same authority that could have approved it formally - a manual
    // override is that authority exercised directly, not a way around it
    // (docs/PROJECT-PHASES-PLAN.md acceptance criterion 6).
    const bypassesProtection = machine.isProtected || (machine.isEmergencyDedicated && schedule.type !== "EMERGENCY");
    if (bypassesProtection && !actor.permissions.includes("approval.machine.decide")) {
      throw new ForbiddenException(
        "Overriding a protected or emergency-reserved machine requires approval authority",
      );
    }

    const newStatus: MachineStatus =
      machine.isEmergencyDedicated && schedule.type === "EMERGENCY" ? "EMERGENCY_RESERVED" : "RESERVED";

    return this.prisma.$transaction(async (tx) => {
      await this.transitionStatus(tx, machine, newStatus, actor, reason);
      await tx.dialysisSchedule.update({ where: { id: schedule.id }, data: { machineId: machine.id } });
      await this.syncSessionOnAssigned(tx, schedule.id, machine.id);

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "MACHINE_ASSIGNED_MANUAL_OVERRIDE",
          entityType: "DialysisSchedule",
          entityId: schedule.id,
          newValue: { machineId: machine.id },
          reason,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: schedule.patientId,
          type: "MACHINE_ASSIGNED",
          payload: { machineId: machine.id, machineCode: machine.machineCode, manualOverride: true, reason },
          performedById: actor.id,
          sourceModule: "machines",
        },
      });

      return {
        machine: await tx.machine.findUniqueOrThrow({ where: { id: machine.id } }),
        approval: null,
      };
    });
  }

  private async autoAssign(
    schedule: { id: string; patientId: string; type: string },
    actor: AuthenticatedUser,
  ) {
    // Stage 1: exclude anything not AVAILABLE.
    const available = await this.prisma.machine.findMany({
      where: { status: "AVAILABLE" },
      orderBy: { machineCode: "asc" },
    });

    // Stage 2: ordinary available machines - never protected, and never the
    // emergency-dedicated pool unless this session itself is an emergency.
    const eligibleDirect = available.filter(
      (m) => !m.isProtected && (!m.isEmergencyDedicated || schedule.type === "EMERGENCY"),
    );
    if (eligibleDirect.length > 0) {
      return this.finalizeAssignment(schedule, eligibleDirect[0], actor, "Automatic assignment");
    }

    // Stage 3: no ordinary machine free - fall back to a protected/emergency
    // one, but only via an approval request, never a direct assignment.
    // Stage 4 (preserving emergency capacity) is enforced by this same
    // filter: an emergency-dedicated machine only reaches this branch for a
    // non-emergency session, i.e. it still requires approval rather than
    // being handed out.
    const needsApproval = available.filter(
      (m) => m.isProtected || (m.isEmergencyDedicated && schedule.type !== "EMERGENCY"),
    );
    if (needsApproval.length > 0) {
      const approval = await this.createApprovalRequest(
        schedule,
        needsApproval[0],
        "Automatic: no ordinary machine available",
        actor,
      );
      return { machine: await this.prisma.machine.findUniqueOrThrow({ where: { id: needsApproval[0].id } }), approval };
    }

    throw new ConflictException("No machine available for assignment right now");
  }

  private async finalizeAssignment(
    schedule: { id: string; patientId: string; type: string },
    machine: Machine,
    actor: AuthenticatedUser,
    reason: string,
  ) {
    const newStatus: MachineStatus =
      machine.isEmergencyDedicated && schedule.type === "EMERGENCY" ? "EMERGENCY_RESERVED" : "RESERVED";

    return this.prisma.$transaction(async (tx) => {
      await this.transitionStatus(tx, machine, newStatus, actor, reason);
      await tx.dialysisSchedule.update({ where: { id: schedule.id }, data: { machineId: machine.id } });
      await this.syncSessionOnAssigned(tx, schedule.id, machine.id);

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "MACHINE_ASSIGNED_AUTO",
          entityType: "DialysisSchedule",
          entityId: schedule.id,
          newValue: { machineId: machine.id },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: schedule.patientId,
          type: "MACHINE_ASSIGNED",
          payload: { machineId: machine.id, machineCode: machine.machineCode, manualOverride: false },
          performedById: actor.id,
          sourceModule: "machines",
        },
      });

      return {
        machine: await tx.machine.findUniqueOrThrow({ where: { id: machine.id } }),
        approval: null,
      };
    });
  }

  // --- Approvals -------------------------------------------------------------

  private async createApprovalRequest(
    schedule: { id: string; patientId: string },
    machine: Machine,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.transitionStatus(tx, machine, "APPROVAL_REQUIRED", actor, reason);
      await this.syncSessionOnApprovalRequired(tx, schedule.id);

      // Upsert on (patientId, machineId, scheduleId): a repeat request for
      // the same session/machine updates instead of duplicating
      // (docs/MODULES-SPEC.md Phase 5).
      const approval = await tx.machineUsageApprovalRequest.upsert({
        where: {
          patientId_machineId_scheduleId: {
            patientId: schedule.patientId,
            machineId: machine.id,
            scheduleId: schedule.id,
          },
        },
        update: { reason, decision: "PENDING", decidedById: null, decidedAt: null },
        create: {
          patientId: schedule.patientId,
          machineId: machine.id,
          scheduleId: schedule.id,
          reason,
          requestedById: actor.id,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "MACHINE_APPROVAL_REQUESTED",
          entityType: "MachineUsageApprovalRequest",
          entityId: approval.id,
          newValue: { machineId: machine.id, scheduleId: schedule.id, reason },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: schedule.patientId,
          type: "MACHINE_APPROVAL_REQUESTED",
          payload: { machineId: machine.id, machineCode: machine.machineCode, reason },
          performedById: actor.id,
          sourceModule: "machines",
        },
      });

      return approval;
    });
  }

  async requestApproval(dto: RequestApprovalDto, actor: AuthenticatedUser) {
    const schedule = await this.prisma.dialysisSchedule.findUnique({ where: { id: dto.scheduleId } });
    if (!schedule) {
      throw new NotFoundException("Schedule entry not found");
    }
    if (schedule.machineId) {
      throw new ConflictException("This session already has a machine assigned");
    }
    const machine = await this.requireMachine(dto.machineId);
    if (machine.status !== "AVAILABLE" && machine.status !== "APPROVAL_REQUIRED") {
      throw new ConflictException(`Machine is ${machine.status}, not available to request`);
    }
    // Two different patients can both have a request pending on the same
    // machine at once - a decider should be able to see and weigh both.
    // What must never happen is BOTH decisions resolving onto the same
    // physical machine, which decideApproval's atomic re-check below
    // prevents at the point that actually matters (docs review DCMS-047).

    return this.createApprovalRequest(schedule, machine, dto.reason, actor);
  }

  async listApprovals(decision?: "PENDING" | "APPROVED" | "REJECTED") {
    return this.prisma.machineUsageApprovalRequest.findMany({
      where: decision ? { decision } : undefined,
      include: {
        machine: true,
        patient: { select: { id: true, fullName: true, patientCode: true } },
        requestedBy: { select: { id: true, fullName: true } },
        decidedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async decideApproval(approvalId: string, dto: DecideApprovalDto, actor: AuthenticatedUser) {
    const approval = await this.prisma.machineUsageApprovalRequest.findUnique({
      where: { id: approvalId },
      include: { machine: true, schedule: true },
    });
    if (!approval) {
      throw new NotFoundException("Approval request not found");
    }
    if (approval.decision !== "PENDING") {
      throw new ConflictException(`This request was already ${approval.decision}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic and conditional on still being PENDING - two concurrent
      // decisions on the same request can't both apply (same pattern as the
      // Phase 3 check-in fix).
      const result = await tx.machineUsageApprovalRequest.updateMany({
        where: { id: approvalId, decision: "PENDING" },
        data: { decision: dto.decision, decidedById: actor.id, decidedAt: new Date() },
      });
      if (result.count === 0) {
        throw new ConflictException("This request was already decided");
      }

      // Re-read the machine inside the transaction: two different patients
      // can each have a request pending on the same machine at once (a
      // decider should be able to see and weigh both), so by the time this
      // one is decided the machine may already have moved off
      // APPROVAL_REQUIRED because a competing request was decided first
      // (docs review DCMS-047).
      const freshMachine = await tx.machine.findUniqueOrThrow({ where: { id: approval.machineId } });
      const machineStillPending = freshMachine.status === "APPROVAL_REQUIRED";

      if (dto.decision === "APPROVED") {
        // Approving means claiming the machine - that's only valid if it's
        // still actually up for claiming. If a competing request already
        // won it, this one can't also win it.
        if (!machineStillPending) {
          throw new ConflictException(
            `Cannot approve - the machine's status changed to ${freshMachine.status} since the request was made`,
          );
        }
        const newStatus: MachineStatus =
          freshMachine.isEmergencyDedicated && approval.schedule.type === "EMERGENCY"
            ? "EMERGENCY_RESERVED"
            : "RESERVED";
        await this.transitionStatus(
          tx,
          freshMachine,
          newStatus,
          actor,
          dto.reason ?? `Approved by ${actor.fullName}`,
        );
        await tx.dialysisSchedule.update({
          where: { id: approval.scheduleId },
          data: { machineId: approval.machineId },
        });
        await this.syncSessionOnAssigned(tx, approval.scheduleId, approval.machineId);
      } else if (machineStillPending) {
        // Rejected: machine goes back to the pool, the schedule stays
        // without a machine (docs/PROJECT-PHASES-PLAN.md: "المريض ينتظر").
        await this.transitionStatus(
          tx,
          freshMachine,
          "AVAILABLE",
          actor,
          dto.reason ?? "Approval rejected - machine released",
        );
      }
      // else: rejecting a request whose machine a competing decision already
      // resolved is just closing out stale paperwork - it must not touch a
      // reservation that isn't this request's to release.

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: dto.decision === "APPROVED" ? "MACHINE_APPROVAL_APPROVED" : "MACHINE_APPROVAL_REJECTED",
          entityType: "MachineUsageApprovalRequest",
          entityId: approvalId,
          newValue: { decision: dto.decision, decidedBy: actor.fullName },
          reason: dto.reason,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: approval.patientId,
          type: dto.decision === "APPROVED" ? "MACHINE_APPROVAL_APPROVED" : "MACHINE_APPROVAL_REJECTED",
          payload: { machineId: approval.machineId, decidedBy: actor.fullName, reason: dto.reason ?? null },
          performedById: actor.id,
          sourceModule: "machines",
        },
      });

      return tx.machineUsageApprovalRequest.findUniqueOrThrow({
        where: { id: approvalId },
        include: { machine: true, decidedBy: { select: { id: true, fullName: true } } },
      });
    });
  }
}
