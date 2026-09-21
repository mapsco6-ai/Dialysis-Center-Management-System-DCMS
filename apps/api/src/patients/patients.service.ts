import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PatientStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { CreateAlertDto } from "./dto/create-alert.dto";
import { TimelineQueryDto } from "./dto/timeline-query.dto";
import { CreateAccessRecordDto, UpdateAccessRecordDto } from "./dto/access-record.dto";
import { createPatientAtomically } from "./create-patient-atomically";
import { isUniqueConstraintOn } from "./prisma-errors.util";

const MAX_PAGE_SIZE = 100;

// Editing these fields is a clinical decision, not clerical data entry, so
// docs/MODULES-SPEC.md requires a mandatory reason + AuditLog when they change.
const SENSITIVE_FIELDS = ["dryWeight", "vascularAccessType", "vascularAccessLocation"] as const;

// List/search results go to anyone with patient.view (reception, warehouse
// staff assigned it later, etc.) - clinical notes, allergies, and weight
// don't belong there. Only the single-patient view (patient.view + opening
// that specific chart) returns the full record (docs review DCMS-006).
const PATIENT_LIST_SELECT = {
  id: true,
  patientCode: true,
  barcode: true,
  fullName: true,
  gender: true,
  dateOfBirth: true,
  phone: true,
  address: true,
  fileNumber: true,
  registeredAt: true,
  status: true,
  createdAt: true,
} satisfies Prisma.PatientSelect;

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async requireExists(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id }, select: { id: true } });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }
  }

  async create(dto: CreatePatientDto, actor: AuthenticatedUser) {
    const data: Omit<Prisma.PatientCreateInput, "barcode" | "patientCode"> = {
      fullName: dto.fullName,
      gender: dto.gender,
      dateOfBirth: new Date(dto.dateOfBirth),
      phone: dto.phone,
      address: dto.address,
      fileNumber: dto.fileNumber,
      dialysisStartDate: dto.dialysisStartDate ? new Date(dto.dialysisStartDate) : undefined,
      dryWeight: dto.dryWeight,
      vascularAccessType: dto.vascularAccessType,
      vascularAccessLocation: dto.vascularAccessLocation,
      diagnoses: dto.diagnoses,
      chronicDiseases: dto.chronicDiseases,
      allergies: dto.allergies,
      medicalNotes: dto.medicalNotes,
      specialInstructions: dto.specialInstructions,
    };

    const created = await createPatientAtomically(this.prisma, data, async (tx, patient) => {
      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "PATIENT_CREATED",
          entityType: "Patient",
          entityId: patient.id,
          newValue: patient,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: patient.id,
          type: "PATIENT_REGISTERED",
          payload: { patientCode: patient.patientCode, barcode: patient.barcode },
          performedById: actor.id,
          sourceModule: "patients",
        },
      });
    });
    // Live-update tag only (V1.1 §2.2, same data-free contract as
    // DashboardGateway's other entities): connected clients re-fetch the
    // permission-gated registry; no patient data ever rides the socket.
    this.eventEmitter.emit("live.update", { entity: "patient" });
    return created;
  }

  // Returns { data, total } so the registry can paginate 1000+ patients with
  // a real "من X إلى Y من N" footer instead of an unbounded list (V1.1 of
  // docs/COMPREHENSIVE-DEVELOPMENT-PLAN-V1.md §2.2). search() deliberately
  // stays a bare array: quality/reports inline pickers consume that shape and
  // its 100-record cap is by design.
  async findAll(page = 1, limit = 50, status?: PatientStatus) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    const where = status ? { status } : undefined;
    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        select: PATIENT_LIST_SELECT,
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.patient.count({ where }),
    ]);
    return { data, total };
  }

  async search(query: string) {
    return this.prisma.patient.findMany({
      select: PATIENT_LIST_SELECT,
      where: {
        OR: [
          { fullName: { contains: query, mode: "insensitive" } },
          { fileNumber: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
          { patientCode: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { fullName: "asc" },
      take: MAX_PAGE_SIZE,
    });
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: { alerts: { orderBy: { createdAt: "desc" } } },
    });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }
    return patient;
  }

  async findByBarcode(barcode: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { barcode },
      include: { alerts: { where: { resolvedAt: null }, orderBy: { createdAt: "desc" } } },
    });
    if (!patient) {
      throw new NotFoundException("No patient with this barcode");
    }
    return patient;
  }

  async update(id: string, dto: UpdatePatientDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Patient not found");
    }

    const { reason, ...fields } = dto;
    const touchesSensitiveField = SENSITIVE_FIELDS.some(
      (field) => fields[field as keyof typeof fields] !== undefined,
    );
    if (touchesSensitiveField && !reason) {
      throw new BadRequestException(
        `A reason is required when changing: ${SENSITIVE_FIELDS.join(", ")}`,
      );
    }

    // A status change (e.g. to TRANSFERRED/TRANSPLANTED/ON_HOLD) needs a
    // recorded reason and date, kept on the patient itself, not only in audit.
    const statusChanged = fields.status !== undefined && fields.status !== existing.status;
    if (statusChanged && !reason) {
      throw new BadRequestException("A reason is required when changing the patient status");
    }

    const data: Prisma.PatientUpdateInput = {
      ...fields,
      ...(statusChanged ? { statusReason: reason, statusChangedAt: new Date() } : {}),
      dateOfBirth: fields.dateOfBirth ? new Date(fields.dateOfBirth) : undefined,
      // Distinguish "omitted" (undefined -> leave alone) from an explicit
      // `null` (-> clear the field) - dialysisStartDate is nullable in the
      // schema, so a client must be able to actually clear it (docs review
      // DCMS-016: this used to silently no-op on null).
      dialysisStartDate:
        fields.dialysisStartDate === undefined
          ? undefined
          : fields.dialysisStartDate === null
            ? null
            : new Date(fields.dialysisStartDate),
    };

    const oldValue: Record<string, unknown> = {};
    const newValue: Record<string, unknown> = {};
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      oldValue[key] = (existing as Record<string, unknown>)[key];
      newValue[key] = fields[key];
    }

    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.update({ where: { id }, data });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "PATIENT_UPDATED",
          entityType: "Patient",
          entityId: id,
          oldValue,
          newValue,
          reason,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: id,
          type: "PATIENT_UPDATED",
          payload: { changedFields: Object.keys(fields), reason: reason ?? null },
          performedById: actor.id,
          sourceModule: "patients",
        },
      });

      return patient;
    });
  }

  async getTimeline(id: string, query: TimelineQueryDto = {}) {
    await this.requireExists(id);
    const include = { performedBy: { select: { id: true, username: true, fullName: true } } };
    if (query.page === undefined) {
      return this.prisma.patientTimelineEvent.findMany({
        where: { patientId: id },
        orderBy: { performedAt: "asc" },
        include,
      });
    }
    const limit = query.limit ?? 50;
    const where: Prisma.PatientTimelineEventWhereInput = {
      patientId: id,
      type: query.type,
      ...(query.from || query.to
        ? { performedAt: { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } }
        : {}),
    };
    const [data, total] = await Promise.all([
      // Newest first when paging - the recent history is what gets read.
      this.prisma.patientTimelineEvent.findMany({
        where,
        orderBy: [{ performedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * limit,
        take: limit,
        include,
      }),
      this.prisma.patientTimelineEvent.count({ where }),
    ]);
    return { data, total };
  }

  async overview(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [openAlerts, lastSession, lastLabOrder, activePrescriptions, upcoming, sessionCount] = await Promise.all([
      this.prisma.clinicalAlert.findMany({ where: { patientId: id, resolvedAt: null }, orderBy: { createdAt: "desc" } }),
      this.prisma.dialysisSession.findFirst({
        where: { patientId: id },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, startTime: true, endTime: true, preWeight: true, postWeight: true, actualUF: true, complications: true },
      }),
      this.prisma.labOrder.findFirst({
        where: { patientId: id },
        orderBy: { orderedAt: "desc" },
        select: { id: true, orderedAt: true, items: { select: { status: true, labTest: { select: { code: true, name: true } } } } },
      }),
      this.prisma.prescription.findMany({
        where: { patientId: id, status: { in: ["ACTIVE", "DISPENSING", "MODIFIED"] } },
        select: { id: true, medicationName: true, dose: true, frequency: true, status: true },
      }),
      this.prisma.dialysisSchedule.findMany({
        where: { patientId: id, scheduledDate: { gte: today }, status: { in: ["SCHEDULED", "ARRIVED", "LATE"] } },
        orderBy: { scheduledDate: "asc" },
        take: 5,
        select: { id: true, scheduledDate: true, status: true, type: true, shift: { select: { name: true } } },
      }),
      this.prisma.dialysisSession.count({ where: { patientId: id, status: { in: ["COMPLETED", "DISCHARGED"] } } }),
    ]);
    return { patient, openAlerts, lastSession, lastLabOrder, activePrescriptions, upcomingAppointments: upcoming, completedSessions: sessionCount };
  }

  // Recording that a specific person saw the alert (does not resolve it).
  async acknowledgeAlert(patientId: string, alertId: string, actor: AuthenticatedUser) {
    const alert = await this.prisma.clinicalAlert.findUnique({ where: { id: alertId } });
    if (!alert || alert.patientId !== patientId) {
      throw new NotFoundException("Alert not found for this patient");
    }
    if (alert.acknowledgedAt) {
      throw new BadRequestException("Alert is already acknowledged");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clinicalAlert.update({
        where: { id: alertId },
        data: { acknowledgedAt: new Date(), acknowledgedById: actor.id },
      });
      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "CLINICAL_ALERT_ACKNOWLEDGED",
          entityType: "ClinicalAlert",
          entityId: alertId,
          patientId,
        },
        tx,
      );
      return updated;
    });
  }

  async listAlerts(patientId: string) {
    await this.requireExists(patientId);
    return this.prisma.clinicalAlert.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createAlert(patientId: string, dto: CreateAlertDto, actor: AuthenticatedUser) {
    await this.requireExists(patientId);

    return this.prisma.$transaction(async (tx) => {
      const alert = await tx.clinicalAlert.create({
        data: {
          patientId,
          severity: dto.severity,
          category: dto.category,
          message: dto.message,
          createdById: actor.id,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "CLINICAL_ALERT_CREATED",
          entityType: "ClinicalAlert",
          entityId: alert.id,
          newValue: alert,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId,
          type: "CLINICAL_ALERT_CREATED",
          payload: { severity: dto.severity, category: dto.category, message: dto.message },
          performedById: actor.id,
          sourceModule: "patients",
        },
      });

      return alert;
    });
  }

  async resolveAlert(patientId: string, alertId: string, actor: AuthenticatedUser, reason?: string) {
    const alert = await this.prisma.clinicalAlert.findUnique({ where: { id: alertId } });
    if (!alert || alert.patientId !== patientId) {
      throw new NotFoundException("Alert not found for this patient");
    }
    if (alert.resolvedAt) {
      throw new BadRequestException("Alert is already resolved");
    }

    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.clinicalAlert.update({
        where: { id: alertId },
        data: { resolvedAt: new Date() },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "CLINICAL_ALERT_RESOLVED",
          entityType: "ClinicalAlert",
          entityId: alertId,
          oldValue: { resolvedAt: null },
          newValue: { resolvedAt: resolved.resolvedAt },
          reason,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId,
          type: "CLINICAL_ALERT_RESOLVED",
          payload: { alertId, category: alert.category, reason: reason ?? null },
          performedById: actor.id,
          sourceModule: "patients",
        },
      });

      return resolved;
    });
  }

  // Break-the-glass: a restricted chart (VIP, staff member's own record...)
  // opens only with a stated reason, which is written to the audit trail.
  async assertChartAccess(id: string, actor: AuthenticatedUser, reason?: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id }, select: { isRestricted: true } });
    if (!patient?.isRestricted) return;
    if (!reason || reason.trim().length < 5) {
      throw new ForbiddenException({
        statusCode: 403,
        code: "BREAK_GLASS_REQUIRED",
        message: "This chart is restricted. Provide ?reason=... (min 5 characters); the access is audited.",
      });
    }
    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "PATIENT_BREAK_GLASS_ACCESS",
      entityType: "Patient",
      entityId: id,
      reason: reason.trim(),
    });
  }

  async setRestricted(id: string, restricted: boolean, reason: string, actor: AuthenticatedUser) {
    await this.requireExists(id);
    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.update({
        where: { id },
        data: { isRestricted: restricted, restrictedReason: restricted ? reason : null },
        select: { id: true, isRestricted: true, restrictedReason: true },
      });
      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: restricted ? "PATIENT_RESTRICTED" : "PATIENT_UNRESTRICTED",
          entityType: "Patient",
          entityId: id,
          reason,
        },
        tx,
      );
      return patient;
    });
  }

  // --- Vascular access history ----------------------------------------------

  async listAccessRecords(patientId: string) {
    await this.requireExists(patientId);
    return this.prisma.accessRecord.findMany({
      where: { patientId },
      orderBy: { placedAt: "desc" },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
  }

  async createAccessRecord(patientId: string, dto: CreateAccessRecordDto, actor: AuthenticatedUser) {
    await this.requireExists(patientId);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.accessRecord.create({
        data: { patientId, type: dto.type, location: dto.location, placedAt: new Date(dto.placedAt), notes: dto.notes, createdById: actor.id },
      });
      await this.auditService.log(
        { actorId: actor.id, actorRole: actor.roles[0] ?? "UNKNOWN", action: "ACCESS_RECORD_CREATED", entityType: "AccessRecord", entityId: record.id, patientId, newValue: record },
        tx,
      );
      await tx.patientTimelineEvent.create({
        data: { patientId, type: "ACCESS_RECORD_CREATED", payload: { type: dto.type, location: dto.location }, performedById: actor.id, sourceModule: "patients" },
      });
      return record;
    });
  }

  async closeAccessRecord(patientId: string, recordId: string, dto: UpdateAccessRecordDto, actor: AuthenticatedUser) {
    const record = await this.prisma.accessRecord.findUnique({ where: { id: recordId } });
    if (!record || record.patientId !== patientId) throw new NotFoundException("Access record not found for this patient");
    if (record.status !== "ACTIVE") throw new BadRequestException(`Access record is already ${record.status}`);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.accessRecord.update({ where: { id: recordId }, data: { status: dto.status, removedAt: new Date(dto.removedAt) } });
      await this.auditService.log(
        { actorId: actor.id, actorRole: actor.roles[0] ?? "UNKNOWN", action: "ACCESS_RECORD_CLOSED", entityType: "AccessRecord", entityId: recordId, patientId, oldValue: { status: "ACTIVE" }, newValue: { status: dto.status }, reason: dto.reason },
        tx,
      );
      await tx.patientTimelineEvent.create({
        data: { patientId, type: "ACCESS_RECORD_CLOSED", payload: { status: dto.status, reason: dto.reason }, performedById: actor.id, sourceModule: "patients" },
      });
      return updated;
    });
  }
}
