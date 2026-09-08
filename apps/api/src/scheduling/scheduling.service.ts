import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SetDialysisPlanDto } from "./dto/set-dialysis-plan.dto";
import { CreateExtraSessionDto } from "./dto/create-extra-session.dto";
import { CreateEmergencySessionDto } from "./dto/create-emergency-session.dto";
import { isUniqueConstraintOn } from "../patients/prisma-errors.util";
import { toDateOnly, todayDateOnly, weekdayOf } from "./date.util";

const SCHEDULE_INCLUDE = {
  patient: { select: { id: true, fullName: true, patientCode: true, barcode: true } },
  shift: true,
} satisfies Prisma.DialysisScheduleInclude;

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

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
    const activePlans = await this.prisma.dialysisPlan.findMany({
      where: {
        weekday,
        isActive: true,
        effectiveFrom: { lte: date },
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

  async getScheduleForDate(dateInput: string | Date) {
    const date = toDateOnly(dateInput);
    await this.ensureGenerated(date);
    return this.prisma.dialysisSchedule.findMany({
      where: { scheduledDate: date },
      include: SCHEDULE_INCLUDE,
      orderBy: [{ shiftId: "asc" }, { createdAt: "asc" }],
    });
  }

  async getScheduleForToday() {
    return this.getScheduleForDate(todayDateOnly());
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
            status: "EXTRA",
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
            status: "EMERGENCY",
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
