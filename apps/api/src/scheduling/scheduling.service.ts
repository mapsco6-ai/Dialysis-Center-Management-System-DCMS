import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ScheduleStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SetDialysisPlanDto } from "./dto/set-dialysis-plan.dto";
import { CreateExtraSessionDto } from "./dto/create-extra-session.dto";
import { CreateEmergencySessionDto } from "./dto/create-emergency-session.dto";
import { CheckInDto } from "./dto/check-in.dto";
import { isUniqueConstraintOn } from "../patients/prisma-errors.util";
import { combineLocalDateAndTime, toDateOnly, todayDateOnly, weekdayOf } from "./date.util";
import { SYSTEM_USERNAME } from "../common/system-user";

const SCHEDULE_INCLUDE = {
  patient: { select: { id: true, fullName: true, patientCode: true, barcode: true, fileNumber: true } },
  shift: true,
} satisfies Prisma.DialysisScheduleInclude;

// Only these can transition to ARRIVED/LATE via check-in. ABSENT is included
// because a patient can still show up (very late) after being auto-marked
// absent - the check-in must still work, per the append-or-amend rule.
const CHECKINABLE_STATUSES: ScheduleStatus[] = ["SCHEDULED", "ABSENT"];

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // Memoized: the system user's id never changes at runtime.
  private systemUserId?: string;
  private async getSystemUserId(): Promise<string> {
    if (!this.systemUserId) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { username: SYSTEM_USERNAME } });
      this.systemUserId = user.id;
    }
    return this.systemUserId;
  }

  private async requirePatient(patientId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }
    return patient;
  }

  private async requireShift(shiftId: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) {
      throw new BadRequestException("Shift not found");
    }
    return shift;
  }

  // --- Dialysis Plan ---------------------------------------------------

  async setDialysisPlan(patientId: string, dto: SetDialysisPlanDto, actor: AuthenticatedUser) {
    await this.requirePatient(patientId);

    const weekdays = dto.entries.map((e) => e.weekday);
    if (new Set(weekdays).size !== weekdays.length) {
      throw new BadRequestException("Duplicate weekday in dialysis plan entries");
    }
    for (const entry of dto.entries) {
      await this.requireShift(entry.shiftId);
    }

    const now = new Date();
    const plainEntries = dto.entries.map((entry) => ({ weekday: entry.weekday, shiftId: entry.shiftId }));

    return this.prisma.$transaction(async (tx) => {
      await tx.dialysisPlan.updateMany({
        where: { patientId, isActive: true, effectiveTo: null },
        data: { isActive: false, effectiveTo: now },
      });

      const created = await Promise.all(
        dto.entries.map((entry) =>
          tx.dialysisPlan.create({
            data: {
              patientId,
              weekday: entry.weekday,
              shiftId: entry.shiftId,
              effectiveFrom: now,
            },
          }),
        ),
      );

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "DIALYSIS_PLAN_SET",
          entityType: "Patient",
          entityId: patientId,
          newValue: { entries: plainEntries },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId,
          type: "DIALYSIS_PLAN_SET",
          payload: { entries: plainEntries },
          performedById: actor.id,
          sourceModule: "scheduling",
        },
      });

      return created;
    });
  }

  async getDialysisPlan(patientId: string) {
    await this.requirePatient(patientId);
    return this.prisma.dialysisPlan.findMany({
      where: { patientId, isActive: true, effectiveTo: null },
      include: { shift: true },
      orderBy: { weekday: "asc" },
    });
  }

  // --- Daily Schedule ----------------------------------------------------

  // REGULAR rows are lazily materialized the first time a date is read - see
  // the module-level note in schema.prisma for why this replaces a cron job.
  private async ensureGenerated(date: Date) {
    const weekday = weekdayOf(date);
    // effectiveFrom/effectiveTo are real timestamps (whatever moment the plan
    // was set), while `date` is a calendar-day marker at UTC midnight. A plan
    // set at, say, 10:00 today must still count as effective *today* - so
    // compare against the start of the *next* calendar day, not `date`
    // itself, or a same-day plan would look like it starts "in the future".
    const startOfNextDay = new Date(date);
    startOfNextDay.setUTCDate(startOfNextDay.getUTCDate() + 1);

    const activePlans = await this.prisma.dialysisPlan.findMany({
      where: {
        weekday,
        isActive: true,
        effectiveFrom: { lt: startOfNextDay },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
    });
    if (activePlans.length === 0) return;

    await this.prisma.dialysisSchedule.createMany({
      data: activePlans.map((plan) => ({
        patientId: plan.patientId,
        planId: plan.id,
        scheduledDate: date,
        shiftId: plan.shiftId,
        status: "SCHEDULED" as const,
        type: "REGULAR" as const,
      })),
      skipDuplicates: true,
    });
  }

  // Same "lazy instead of cron" reasoning as ensureGenerated: whenever this
  // date's schedule is read (which happens continuously anyway - the status
  // board polls it), any row whose shift dialysis window has fully elapsed
  // with no check-in gets marked ABSENT right then. This is still "not
  // manual" (docs/MODULES-SPEC.md Phase 3) - no human ever flips this status.
  private async ensureAbsencesMarked(date: Date) {
    const now = new Date();
    const shifts = await this.prisma.shift.findMany();
    let systemUserId: string | undefined;

    for (const shift of shifts) {
      const shiftEnd = combineLocalDateAndTime(date, shift.dialysisEnd);
      if (shiftEnd > now) continue;

      const candidates = await this.prisma.dialysisSchedule.findMany({
        where: { scheduledDate: date, shiftId: shift.id, status: "SCHEDULED" },
        select: { id: true, patientId: true },
      });
      if (candidates.length === 0) continue;

      systemUserId ??= await this.getSystemUserId();

      // One row at a time, conditional on still being SCHEDULED: this is
      // read continuously by polling clients, so two overlapping reads could
      // otherwise both "win" and double-log the same transition. Every row
      // that does flip gets its own audit + timeline event - this was
      // silently skipped before (docs review DCMS-038), leaving a
      // clinically-relevant transition with zero trace in the patient's
      // history.
      for (const candidate of candidates) {
        await this.prisma.$transaction(async (tx) => {
          const result = await tx.dialysisSchedule.updateMany({
            where: { id: candidate.id, status: "SCHEDULED" },
            data: { status: "ABSENT", absentMarkedAt: now },
          });
          if (result.count === 0) return; // another concurrent read already marked it

          await this.auditService.log(
            {
              actorId: systemUserId!,
              actorRole: "SYSTEM",
              action: "PATIENT_MARKED_ABSENT",
              entityType: "DialysisSchedule",
              entityId: candidate.id,
              oldValue: { status: "SCHEDULED" },
              newValue: { status: "ABSENT", absentMarkedAt: now },
            },
            tx,
          );

          await tx.patientTimelineEvent.create({
            data: {
              patientId: candidate.patientId,
              type: "PATIENT_MARKED_ABSENT",
              payload: { scheduleId: candidate.id, shiftId: shift.id },
              performedById: null,
              sourceModule: "scheduling",
            },
          });
        });
      }
    }
  }

  async getScheduleForDate(dateInput: string | Date, status?: ScheduleStatus) {
    const date = toDateOnly(dateInput);
    await this.ensureGenerated(date);
    await this.ensureAbsencesMarked(date);
    return this.prisma.dialysisSchedule.findMany({
      where: { scheduledDate: date, ...(status ? { status } : {}) },
      include: SCHEDULE_INCLUDE,
      orderBy: [{ shiftId: "asc" }, { createdAt: "asc" }],
    });
  }

  async getScheduleForToday() {
    return this.getScheduleForDate(todayDateOnly());
  }

  // --- Reception / Check-in -----------------------------------------------

  async findTodayForPatient(patientId: string) {
    await this.requirePatient(patientId);
    const date = todayDateOnly();
    await this.ensureGenerated(date);
    await this.ensureAbsencesMarked(date);
    return this.prisma.dialysisSchedule.findMany({
      where: { patientId, scheduledDate: date },
      include: SCHEDULE_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
  }

  async checkIn(scheduleId: string, dto: CheckInDto, actor: AuthenticatedUser) {
    const schedule = await this.prisma.dialysisSchedule.findUnique({
      where: { id: scheduleId },
      include: SCHEDULE_INCLUDE,
    });
    if (!schedule) {
      throw new NotFoundException("Schedule entry not found");
    }
    if (!CHECKINABLE_STATUSES.includes(schedule.status)) {
      throw new ConflictException(
        `Cannot check in a schedule entry with status ${schedule.status} (idempotent - already checked in?)`,
      );
    }

    // Ordinary reception check-in only makes sense for today's own schedule -
    // a receptionist scanning someone physically present can't be confirming
    // a session that hasn't happened yet or is from a past day. Backdated
    // corrections need their own audited/permissioned path (not built yet),
    // not this endpoint (docs review DCMS-037).
    if (toDateOnly(schedule.scheduledDate).getTime() !== todayDateOnly().getTime()) {
      throw new ConflictException(
        "This schedule entry is not for today - check-in only applies to today's own schedule",
      );
    }

    const now = new Date();
    const scheduledStart = combineLocalDateAndTime(schedule.scheduledDate, schedule.shift.dialysisStart);
    // Compare the exact (unrounded) elapsed time against the threshold so a
    // policy of "LATE past 30 minutes" actually triggers at 30:00.001, not
    // ~30:30 due to rounding first (docs review DCMS-039). Round only the
    // value stored/displayed.
    const exactLateMinutes = Math.max(0, (now.getTime() - scheduledStart.getTime()) / 60000);
    const lateMinutes = Math.round(exactLateMinutes);
    const newStatus: ScheduleStatus = exactLateMinutes > schedule.shift.lateThresholdMinutes ? "LATE" : "ARRIVED";

    return this.prisma.$transaction(async (tx) => {
      // Atomic, conditional on still being in a checkinable state - closes
      // the race where two concurrent check-ins both read SCHEDULED before
      // either writes and both would otherwise succeed, the second silently
      // overwriting the first's time/station/user (docs review: reproduced
      // DCMS-004 specifically against this method).
      const result = await tx.dialysisSchedule.updateMany({
        where: { id: scheduleId, status: { in: CHECKINABLE_STATUSES } },
        data: {
          status: newStatus,
          checkInTime: now,
          checkInByUserId: actor.id,
          checkInStationId: dto.stationId,
          lateMinutes,
        },
      });

      if (result.count === 0) {
        throw new ConflictException(
          "This schedule entry was already checked in by a concurrent request",
        );
      }

      const updated = await tx.dialysisSchedule.findUniqueOrThrow({
        where: { id: scheduleId },
        include: SCHEDULE_INCLUDE,
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "PATIENT_CHECKED_IN",
          entityType: "DialysisSchedule",
          entityId: scheduleId,
          oldValue: { status: schedule.status },
          newValue: { status: newStatus, lateMinutes, checkInStationId: dto.stationId },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: schedule.patientId,
          type: newStatus === "LATE" ? "PATIENT_CHECKED_IN_LATE" : "PATIENT_CHECKED_IN",
          payload: { scheduleId, lateMinutes, stationId: dto.stationId },
          performedById: actor.id,
          sourceModule: "reception",
        },
      });

      return updated;
    });
  }

  // --- Extra / Emergency sessions -----------------------------------------

  async createExtraSession(dto: CreateExtraSessionDto, actor: AuthenticatedUser) {
    await this.requirePatient(dto.patientId);
    await this.requireShift(dto.shiftId);
    const scheduledDate = toDateOnly(dto.scheduledDate);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.dialysisSchedule.create({
          data: {
            patientId: dto.patientId,
            scheduledDate,
            shiftId: dto.shiftId,
            // status starts SCHEDULED like any other entry - `type` alone
            // marks this as an extra session (see schema.prisma comment).
            type: "EXTRA",
            extraReason: dto.extraReason,
            requestedByDoctorId: dto.requestedByDoctorId,
          },
          include: SCHEDULE_INCLUDE,
        });

        await this.auditService.log(
          {
            actorId: actor.id,
            actorRole: actor.roles[0] ?? "UNKNOWN",
            action: "EXTRA_SESSION_CREATED",
            entityType: "DialysisSchedule",
            entityId: created.id,
            newValue: created,
            reason: dto.extraReason,
          },
          tx,
        );

        await tx.patientTimelineEvent.create({
          data: {
            patientId: dto.patientId,
            type: "EXTRA_SESSION_CREATED",
            payload: { scheduledDate: dto.scheduledDate, shiftId: dto.shiftId, reason: dto.extraReason },
            performedById: actor.id,
            sourceModule: "scheduling",
          },
        });

        return created;
      });
    } catch (error) {
      if (isUniqueConstraintOn(error, "patientId")) {
        throw new ConflictException("This patient already has a schedule entry for that date/shift");
      }
      throw error;
    }
  }

  async createEmergencySession(dto: CreateEmergencySessionDto, actor: AuthenticatedUser) {
    await this.requirePatient(dto.patientId);
    await this.requireShift(dto.shiftId);
    const scheduledDate = toDateOnly(dto.scheduledDate);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.dialysisSchedule.create({
          data: {
            patientId: dto.patientId,
            scheduledDate,
            shiftId: dto.shiftId,
            // status starts SCHEDULED like any other entry - `type` alone
            // marks this as an emergency session (see schema.prisma comment).
            type: "EMERGENCY",
            emergencySourceHospital: dto.emergencySourceHospital,
            emergencyReason: dto.emergencyReason,
          },
          include: SCHEDULE_INCLUDE,
        });

        await this.auditService.log(
          {
            actorId: actor.id,
            actorRole: actor.roles[0] ?? "UNKNOWN",
            action: "EMERGENCY_SESSION_CREATED",
            entityType: "DialysisSchedule",
            entityId: created.id,
            newValue: created,
            reason: dto.emergencyReason,
          },
          tx,
        );

        await tx.patientTimelineEvent.create({
          data: {
            patientId: dto.patientId,
            type: "EMERGENCY_SESSION_CREATED",
            payload: {
              scheduledDate: dto.scheduledDate,
              shiftId: dto.shiftId,
              sourceHospital: dto.emergencySourceHospital,
              reason: dto.emergencyReason,
            },
            performedById: actor.id,
            sourceModule: "scheduling",
          },
        });

        return created;
      });
    } catch (error) {
      if (isUniqueConstraintOn(error, "patientId")) {
        throw new ConflictException("This patient already has a schedule entry for that date/shift");
      }
      throw error;
    }
  }
}
