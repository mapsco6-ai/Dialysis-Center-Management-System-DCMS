import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DialysisSession, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MachinesService } from "../machines/machines.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PreDialysisDto } from "./dto/pre-dialysis.dto";
import { StartDialysisDto } from "./dto/start-dialysis.dto";
import { EndDialysisDto } from "./dto/end-dialysis.dto";
import { CreateReadingDto } from "./dto/create-reading.dto";
import { AmendReadingDto } from "./dto/amend-reading.dto";
import { CreateEventDto } from "./dto/create-event.dto";
import { ReassignMachineDto } from "./dto/reassign-machine.dto";

const ARRIVABLE_SCHEDULE_STATUSES = ["ARRIVED", "LATE"];

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly machinesService: MachinesService,
  ) {}

  async getOverview(scheduleId: string) {
    const schedule = await this.prisma.dialysisSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        patient: { select: { id: true, fullName: true, patientCode: true, barcode: true, fileNumber: true } },
        shift: true,
        session: {
          include: {
            machine: true,
            ward: true,
            nurse: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!schedule) {
      throw new NotFoundException("Schedule entry not found");
    }
    return schedule;
  }

  private async requireSession(scheduleId: string): Promise<DialysisSession> {
    const session = await this.prisma.dialysisSession.findUnique({ where: { scheduleId } });
    if (!session) {
      throw new NotFoundException("No dialysis session has been started for this schedule yet - record Pre-Dialysis first");
    }
    return session;
  }

  // --- Pre-Dialysis -> Supplies Ready ----------------------------------------

  async preDialysis(scheduleId: string, dto: PreDialysisDto, actor: AuthenticatedUser) {
    const schedule = await this.prisma.dialysisSchedule.findUnique({
      where: { id: scheduleId },
      include: { session: true },
    });
    if (!schedule) {
      throw new NotFoundException("Schedule entry not found");
    }
    if (!ARRIVABLE_SCHEDULE_STATUSES.includes(schedule.status)) {
      throw new ConflictException(`Cannot record Pre-Dialysis while the schedule is ${schedule.status}`);
    }
    if (schedule.session && schedule.session.status !== "PRE_DIALYSIS") {
      throw new ConflictException(`Session already advanced past Pre-Dialysis (${schedule.session.status})`);
    }

    const vitals = {
      preWeight: dto.weight,
      preBP: dto.bp,
      prePulse: dto.pulse,
      preTemperature: dto.temperature,
      preGlucose: dto.glucose,
      dryWeight: dto.dryWeight,
      preNotes: dto.notes,
    };

    const session = await this.prisma.dialysisSession.upsert({
      where: { scheduleId },
      update: vitals,
      create: { scheduleId, patientId: schedule.patientId, ...vitals },
    });

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "DIALYSIS_PRE_RECORDED",
      entityType: "DialysisSession",
      entityId: session.id,
      newValue: vitals,
    });

    return session;
  }

  async confirmSuppliesReady(scheduleId: string, actor: AuthenticatedUser) {
    const session = await this.requireSession(scheduleId);
    if (session.status !== "PRE_DIALYSIS") {
      throw new ConflictException(`Cannot confirm supplies ready from ${session.status}`);
    }

    const updated = await this.prisma.dialysisSession.update({
      where: { id: session.id },
      data: { status: "SUPPLIES_READY" },
    });

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "DIALYSIS_SUPPLIES_READY",
      entityType: "DialysisSession",
      entityId: session.id,
      newValue: { status: "SUPPLIES_READY" },
    });

    return updated;
  }

  // --- Start / End -------------------------------------------------------------

  async start(scheduleId: string, dto: StartDialysisDto, actor: AuthenticatedUser) {
    const session = await this.requireSession(scheduleId);
    if (session.status !== "ASSIGNED") {
      throw new ConflictException(
        `Cannot start dialysis from ${session.status} - a machine must be ASSIGNED first`,
      );
    }

    const missing: string[] = [];
    if (session.preWeight == null) missing.push("preWeight");
    if (!session.preBP) missing.push("preBP");
    if (session.prePulse == null) missing.push("prePulse");
    if (!session.machineId) missing.push("machine");
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required fields to start dialysis: ${missing.join(", ")}`);
    }

    const machine = await this.prisma.machine.findUniqueOrThrow({ where: { id: session.machineId! } });
    if (machine.status !== "RESERVED" && machine.status !== "EMERGENCY_RESERVED") {
      throw new ConflictException(`Machine is ${machine.status}, expected RESERVED`);
    }

    if (dto.nurseId) {
      const nurse = await this.prisma.user.findUnique({ where: { id: dto.nurseId } });
      if (!nurse) {
        throw new BadRequestException("nurseId does not refer to an existing user");
      }
    }
    const nurseId = dto.nurseId ?? actor.id;
    const startTime = new Date();

    return this.prisma.$transaction(async (tx) => {
      await this.machinesService.transitionStatus(tx, machine, "IN_USE", actor, "Dialysis started");

      const updated = await tx.dialysisSession.update({
        where: { id: session.id },
        data: {
          status: "IN_DIALYSIS",
          nurseId,
          wardId: machine.wardId,
          dialyzerType: dto.dialyzerType,
          bloodLineType: dto.bloodLineType,
          prescribedDurationMinutes: dto.prescribedDurationMinutes,
          requiredUF: dto.requiredUF,
          accessInfo: dto.accessInfo as Prisma.InputJsonValue | undefined,
          startTime,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "DIALYSIS_STARTED",
          entityType: "DialysisSession",
          entityId: session.id,
          newValue: { machineId: machine.id, nurseId, startTime },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: session.patientId,
          type: "DIALYSIS_STARTED",
          payload: { sessionId: session.id, machineCode: machine.machineCode },
          performedById: actor.id,
          sourceModule: "sessions",
        },
      });

      return updated;
    });
  }

  async end(scheduleId: string, dto: EndDialysisDto, actor: AuthenticatedUser) {
    const session = await this.requireSession(scheduleId);
    if (session.status !== "IN_DIALYSIS") {
      throw new ConflictException(`Cannot end dialysis from ${session.status}`);
    }

    const endTime = new Date();
    const actualDurationMinutes = session.startTime
      ? Math.round((endTime.getTime() - session.startTime.getTime()) / 60000)
      : null;

    return this.prisma.$transaction(async (tx) => {
      if (session.machineId) {
        const machine = await tx.machine.findUniqueOrThrow({ where: { id: session.machineId } });
        await this.machinesService.transitionStatus(tx, machine, "WAITING_CLEANING", actor, "Dialysis session ended");
      }

      const updated = await tx.dialysisSession.update({
        where: { id: session.id },
        data: {
          status: "COMPLETED",
          postWeight: dto.postWeight,
          postBP: dto.postBP,
          postPulse: dto.postPulse,
          actualUF: dto.actualUF,
          complications: dto.complications,
          finalNote: dto.finalNote,
          endTime,
          actualDurationMinutes,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "DIALYSIS_ENDED",
          entityType: "DialysisSession",
          entityId: session.id,
          newValue: { actualDurationMinutes, actualUF: dto.actualUF },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: session.patientId,
          type: "DIALYSIS_COMPLETED",
          payload: { sessionId: session.id, actualDurationMinutes, actualUF: dto.actualUF },
          performedById: actor.id,
          sourceModule: "sessions",
        },
      });

      return updated;
    });
  }

  async discharge(scheduleId: string, actor: AuthenticatedUser) {
    const session = await this.requireSession(scheduleId);
    if (session.status !== "COMPLETED") {
      throw new ConflictException(`Cannot discharge from ${session.status}`);
    }

    const updated = await this.prisma.dialysisSession.update({
      where: { id: session.id },
      data: { status: "DISCHARGED" },
    });

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "DIALYSIS_DISCHARGED",
      entityType: "DialysisSession",
      entityId: session.id,
      newValue: { status: "DISCHARGED" },
    });

    return updated;
  }

  async interrupt(scheduleId: string, reason: string, actor: AuthenticatedUser) {
    const session = await this.requireSession(scheduleId);
    if (session.status !== "IN_DIALYSIS") {
      throw new ConflictException(`Cannot interrupt a session that is ${session.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dialysisSession.update({
        where: { id: session.id },
        data: { status: "INTERRUPTED" },
      });

      await tx.dialysisEvent.create({
        data: { sessionId: session.id, type: "SESSION_INTERRUPTED", note: reason, recordedById: actor.id },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "DIALYSIS_INTERRUPTED",
          entityType: "DialysisSession",
          entityId: session.id,
          reason,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: session.patientId,
          type: "DIALYSIS_INTERRUPTED",
          payload: { sessionId: session.id, reason },
          performedById: actor.id,
          sourceModule: "sessions",
        },
      });

      return updated;
    });
  }

  // --- Readings (Append-or-Amend) ---------------------------------------------

  async listReadings(scheduleId: string) {
    const session = await this.requireSession(scheduleId);
    return this.prisma.dialysisReading.findMany({
      where: { sessionId: session.id },
      orderBy: [{ time: "asc" }, { createdAt: "asc" }],
      include: { enteredBy: { select: { id: true, fullName: true } } },
    });
  }

  async addReading(scheduleId: string, dto: CreateReadingDto, actor: AuthenticatedUser) {
    const session = await this.requireSession(scheduleId);
    if (session.status !== "IN_DIALYSIS") {
      throw new ConflictException(`Cannot record a reading while the session is ${session.status}`);
    }

    return this.prisma.dialysisReading.create({
      data: {
        sessionId: session.id,
        time: dto.time ? new Date(dto.time) : new Date(),
        bp: dto.bp,
        pulse: dto.pulse,
        arterialPressure: dto.arterialPressure,
        venousPressure: dto.venousPressure,
        tmp: dto.tmp,
        bloodFlow: dto.bloodFlow,
        uf: dto.uf,
        enteredById: actor.id,
      },
    });
  }

  // Never mutates the original row - creates a new one pointing back at it
  // via amendedFromId, plus an AuditLog with the reason (docs/MODULES-SPEC.md:
  // "لا UPDATE مباشر على قراءة موجودة").
  async amendReading(scheduleId: string, readingId: string, dto: AmendReadingDto, actor: AuthenticatedUser) {
    const session = await this.requireSession(scheduleId);
    const original = await this.prisma.dialysisReading.findUnique({ where: { id: readingId } });
    if (!original || original.sessionId !== session.id) {
      throw new NotFoundException("Reading not found for this session");
    }

    return this.prisma.$transaction(async (tx) => {
      // Fields the caller didn't resend fall back to the original's value -
      // an amendment corrects specific fields, it must not silently discard
      // every other vital the nurse didn't happen to retype.
      const amended = await tx.dialysisReading.create({
        data: {
          sessionId: session.id,
          time: dto.time ? new Date(dto.time) : original.time,
          bp: dto.bp,
          pulse: dto.pulse,
          arterialPressure: dto.arterialPressure ?? original.arterialPressure,
          venousPressure: dto.venousPressure ?? original.venousPressure,
          tmp: dto.tmp ?? original.tmp,
          bloodFlow: dto.bloodFlow ?? original.bloodFlow,
          uf: dto.uf ?? original.uf,
          enteredById: actor.id,
          amendedFromId: original.id,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "DIALYSIS_READING_AMENDED",
          entityType: "DialysisReading",
          entityId: amended.id,
          oldValue: original,
          newValue: amended,
          reason: dto.reason,
        },
        tx,
      );

      return amended;
    });
  }

  // --- Events -----------------------------------------------------------------

  async listEvents(scheduleId: string) {
    const session = await this.requireSession(scheduleId);
    return this.prisma.dialysisEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { recordedAt: "asc" },
      include: { recordedBy: { select: { id: true, fullName: true } } },
    });
  }

  async addEvent(scheduleId: string, dto: CreateEventDto, actor: AuthenticatedUser) {
    const session = await this.requireSession(scheduleId);
    if (session.status !== "IN_DIALYSIS" && session.status !== "POST_DIALYSIS") {
      throw new ConflictException(`Cannot record an event while the session is ${session.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.dialysisEvent.create({
        data: { sessionId: session.id, type: dto.type, note: dto.note, recordedById: actor.id },
      });

      await tx.patientTimelineEvent.create({
        data: {
          patientId: session.patientId,
          type: `DIALYSIS_EVENT_${dto.type}`,
          payload: { sessionId: session.id, note: dto.note ?? null },
          performedById: actor.id,
          sourceModule: "sessions",
        },
      });

      return event;
    });
  }

  // --- Reassign machine mid-session --------------------------------------------

  // A machine failure during a live session: the session itself never ends
  // or gets recreated - only its machineId changes - so every reading/event
  // collected so far stays attached (docs/MODULES-SPEC.md: "لا تُنشأ جلسة
  // جديدة، لضمان استمرارية القراءات والأحداث").
  async reassignMachine(scheduleId: string, dto: ReassignMachineDto, actor: AuthenticatedUser) {
    const session = await this.requireSession(scheduleId);
    if (session.status !== "IN_DIALYSIS") {
      throw new ConflictException(`Can only reassign a machine while IN_DIALYSIS (current: ${session.status})`);
    }
    if (!session.machineId) {
      throw new ConflictException("Session has no machine assigned to reassign from");
    }
    if (dto.newMachineId === session.machineId) {
      throw new BadRequestException("New machine must be different from the current one");
    }

    const oldMachine = await this.prisma.machine.findUniqueOrThrow({ where: { id: session.machineId } });
    const newMachine = await this.prisma.machine.findUnique({ where: { id: dto.newMachineId } });
    if (!newMachine) {
      throw new NotFoundException("New machine not found");
    }
    if (newMachine.status !== "AVAILABLE") {
      throw new ConflictException(`New machine is ${newMachine.status}, not AVAILABLE`);
    }

    return this.prisma.$transaction(async (tx) => {
      // The old machine failed - it isn't returned to the pool, it goes to
      // OUT_OF_SERVICE pending maintenance.
      await this.machinesService.transitionStatus(tx, oldMachine, "OUT_OF_SERVICE", actor, `Reassigned away during session: ${dto.reason}`);
      await this.machinesService.transitionStatus(tx, newMachine, "IN_USE", actor, `Reassigned into session: ${dto.reason}`);

      const updated = await tx.dialysisSession.update({
        where: { id: session.id },
        data: { machineId: newMachine.id, wardId: newMachine.wardId },
      });

      await tx.dialysisSchedule.update({ where: { id: scheduleId }, data: { machineId: newMachine.id } });

      await tx.dialysisEvent.create({
        data: { sessionId: session.id, type: "MACHINE_ISSUE", note: dto.reason, recordedById: actor.id },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "DIALYSIS_MACHINE_REASSIGNED",
          entityType: "DialysisSession",
          entityId: session.id,
          oldValue: { machineId: oldMachine.id },
          newValue: { machineId: newMachine.id },
          reason: dto.reason,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: session.patientId,
          type: "DIALYSIS_MACHINE_REASSIGNED",
          payload: { sessionId: session.id, fromMachineCode: oldMachine.machineCode, toMachineCode: newMachine.machineCode, reason: dto.reason },
          performedById: actor.id,
          sourceModule: "sessions",
        },
      });

      return updated;
    });
  }
}
