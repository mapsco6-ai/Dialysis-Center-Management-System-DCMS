import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { CreateAlertDto } from "./dto/create-alert.dto";
import { generateBarcode, formatPatientCode } from "./patient-code.util";
import { isUniqueConstraintOn } from "./prisma-errors.util";

const MAX_BARCODE_ATTEMPTS = 5;
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
  ) {}

  private async requireExists(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id }, select: { id: true } });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }
  }

  async create(dto: CreatePatientDto, actor: AuthenticatedUser) {
    const data: Prisma.PatientCreateInput = {
      barcode: "", // filled in the retry loop below
      patientCode: "", // filled in the retry loop below
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

    // Deliberately outside the transaction below: each attempt is a
    // standalone insert, and a unique-constraint hit here is expected control
    // flow (try another random barcode), not a fault to roll anything back
    // for. Worst case on a crash right after this succeeds: a patient row
    // whose patientCode still equals its barcode instead of the pretty
    // P-000123 form - a valid, queryable row, not a corrupt one.
    let created: Prisma.PatientGetPayload<object> | undefined;
    for (let attempt = 0; attempt < MAX_BARCODE_ATTEMPTS; attempt++) {
      const barcode = generateBarcode();
      try {
        created = await this.prisma.patient.create({
          data: { ...data, barcode, patientCode: barcode },
        });
        break;
      } catch (error) {
        if (isUniqueConstraintOn(error, "barcode") && attempt < MAX_BARCODE_ATTEMPTS - 1) {
          continue;
        }
        throw error;
      }
    }
    if (!created) {
      throw new BadRequestException("Could not generate a unique barcode, please retry");
    }

    // Everything from here on either all happens or none of it does - no
    // "renamed but unaudited" or "audited but timeline missing" states.
    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.update({
        where: { id: created.id },
        data: { patientCode: formatPatientCode(created.humanNumber) },
      });

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

      return patient;
    });
  }

  async findAll(page = 1, limit = 50) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    return this.prisma.patient.findMany({
      select: PATIENT_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
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

    const data: Prisma.PatientUpdateInput = {
      ...fields,
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

  async getTimeline(id: string) {
    await this.requireExists(id);
    return this.prisma.patientTimelineEvent.findMany({
      where: { patientId: id },
      orderBy: { performedAt: "asc" },
      include: { performedBy: { select: { id: true, username: true, fullName: true } } },
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
}
