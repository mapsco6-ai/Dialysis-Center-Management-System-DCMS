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

// Editing these fields is a clinical decision, not clerical data entry, so
// docs/MODULES-SPEC.md requires a mandatory reason + AuditLog when they change.
const SENSITIVE_FIELDS = ["dryWeight", "vascularAccessType", "vascularAccessLocation"] as const;

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

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

    let created: Prisma.PatientGetPayload<object> | undefined;
    for (let attempt = 0; attempt < MAX_BARCODE_ATTEMPTS; attempt++) {
      const barcode = generateBarcode();
      try {
        // barcode doubles as a temporary unique patientCode placeholder; it's
        // immediately overwritten below once we know the row's humanNumber.
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

    const patient = await this.prisma.patient.update({
      where: { id: created.id },
      data: { patientCode: formatPatientCode(created.humanNumber) },
    });

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "PATIENT_CREATED",
      entityType: "Patient",
      entityId: patient.id,
      newValue: patient,
    });

    await this.prisma.patientTimelineEvent.create({
      data: {
        patientId: patient.id,
        type: "PATIENT_REGISTERED",
        payload: { patientCode: patient.patientCode, barcode: patient.barcode },
        performedById: actor.id,
        sourceModule: "patients",
      },
    });

    return patient;
  }

  async findAll(page = 1, limit = 50) {
    return this.prisma.patient.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async search(query: string) {
    return this.prisma.patient.findMany({
      where: {
        OR: [
          { fullName: { contains: query, mode: "insensitive" } },
          { fileNumber: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
          { patientCode: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { fullName: "asc" },
      take: 100,
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
      dialysisStartDate: fields.dialysisStartDate ? new Date(fields.dialysisStartDate) : undefined,
    };

    const oldValue: Record<string, unknown> = {};
    const newValue: Record<string, unknown> = {};
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      oldValue[key] = (existing as Record<string, unknown>)[key];
      newValue[key] = fields[key];
    }

    const patient = await this.prisma.patient.update({ where: { id }, data });

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "PATIENT_UPDATED",
      entityType: "Patient",
      entityId: id,
      oldValue,
      newValue,
      reason,
    });

    await this.prisma.patientTimelineEvent.create({
      data: {
        patientId: id,
        type: "PATIENT_UPDATED",
        payload: { changedFields: Object.keys(fields), reason: reason ?? null },
        performedById: actor.id,
        sourceModule: "patients",
      },
    });

    return patient;
  }

  async getTimeline(id: string) {
    await this.findOne(id);
    return this.prisma.patientTimelineEvent.findMany({
      where: { patientId: id },
      orderBy: { performedAt: "asc" },
      include: { performedBy: { select: { id: true, username: true, fullName: true } } },
    });
  }

  async listAlerts(patientId: string) {
    await this.findOne(patientId);
    return this.prisma.clinicalAlert.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createAlert(patientId: string, dto: CreateAlertDto, actor: AuthenticatedUser) {
    await this.findOne(patientId);

    const alert = await this.prisma.clinicalAlert.create({
      data: {
        patientId,
        severity: dto.severity,
        category: dto.category,
        message: dto.message,
        createdById: actor.id,
      },
    });

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "CLINICAL_ALERT_CREATED",
      entityType: "ClinicalAlert",
      entityId: alert.id,
      newValue: alert,
    });

    await this.prisma.patientTimelineEvent.create({
      data: {
        patientId,
        type: "CLINICAL_ALERT_CREATED",
        payload: { severity: dto.severity, category: dto.category, message: dto.message },
        performedById: actor.id,
        sourceModule: "patients",
      },
    });

    return alert;
  }
}
