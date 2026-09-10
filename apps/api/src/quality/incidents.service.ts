import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { IncidentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateIncidentDto } from "./dto/create-incident.dto";
import { UpdateIncidentStatusDto } from "./dto/update-incident-status.dto";
import { ListIncidentsQueryDto } from "./dto/list-incidents-query.dto";

const INCIDENT_INCLUDE = {
  patient: { select: { id: true, patientCode: true, fullName: true } },
  session: { select: { id: true, status: true } },
  machine: { select: { id: true, machineCode: true } },
  reportedBy: { select: { id: true, fullName: true } },
  statusHistory: {
    include: { changedBy: { select: { id: true, fullName: true } } },
    orderBy: { changedAt: "asc" as const },
  },
} satisfies Prisma.IncidentReportInclude;

// OPEN can go straight to CLOSED (a minor incident may need no separate
// review step, same "optional middle stage" reasoning as maintenance
// tickets' WAITING_PART) or into UNDER_REVIEW first; UNDER_REVIEW can only
// move forward to CLOSED - nothing ever moves back to OPEN.
const ALLOWED_INCIDENT_TRANSITIONS: Partial<Record<IncidentStatus, IncidentStatus[]>> = {
  OPEN: ["UNDER_REVIEW", "CLOSED"],
  UNDER_REVIEW: ["CLOSED"],
};

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async requireIncident(id: string) {
    const incident = await this.prisma.incidentReport.findUnique({ where: { id } });
    if (!incident) {
      throw new NotFoundException("Incident report not found");
    }
    return incident;
  }

  // Append-only (docs/MODULES-SPEC.md Phase 15: "Append-or-Amend فقط، لا
  // حذف") - this is purely a documentation record. Nothing here or anywhere
  // else in the codebase reads an IncidentReport to trigger an automatic
  // clinical decision (docs acceptance criterion 3; see the schema comment
  // above the model for the full reasoning).
  async create(dto: CreateIncidentDto, actor: AuthenticatedUser) {
    let patientId = dto.patientId;

    if (dto.sessionId) {
      const session = await this.prisma.dialysisSession.findUnique({ where: { id: dto.sessionId } });
      if (!session) {
        throw new BadRequestException("sessionId does not refer to an existing session");
      }
      if (patientId && session.patientId !== patientId) {
        throw new BadRequestException("sessionId does not belong to this patient");
      }
      // A session always belongs to exactly one patient - adopting it here
      // is reading an existing fact, not a judgment call.
      patientId ??= session.patientId;
    }

    // Checked after resolving sessionId -> patientId above, so a report
    // that only names a sessionId (the common case: reporting from inside
    // an active session) isn't wrongly rejected for "naming neither".
    if (!patientId && !dto.machineId) {
      throw new BadRequestException("An incident must reference at least a patient or a machine");
    }

    if (patientId) {
      const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
      if (!patient) {
        throw new NotFoundException("Patient not found");
      }
    }

    if (dto.machineId) {
      const machine = await this.prisma.machine.findUnique({ where: { id: dto.machineId } });
      if (!machine) {
        throw new NotFoundException("Machine not found");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const incident = await tx.incidentReport.create({
        data: {
          patientId,
          sessionId: dto.sessionId,
          machineId: dto.machineId,
          type: dto.type,
          severity: dto.severity,
          description: dto.description,
          reportedById: actor.id,
        },
        include: INCIDENT_INCLUDE,
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "INCIDENT_REPORTED",
          entityType: "IncidentReport",
          entityId: incident.id,
          newValue: { type: dto.type, severity: dto.severity, patientId, machineId: dto.machineId },
        },
        tx,
      );

      // Acceptance criterion 1: must appear in the patient's own Timeline,
      // same rule every other patient-facing create already follows (docs/
      // MODULES-SPEC.md: "كل عملية إنشاء ... يجب أن تكتب أيضاً سطراً في
      // PatientTimelineEvent").
      if (patientId) {
        await tx.patientTimelineEvent.create({
          data: {
            patientId,
            type: `INCIDENT_${dto.type}`,
            payload: { incidentId: incident.id, severity: dto.severity, description: dto.description },
            performedById: actor.id,
            sourceModule: "quality",
          },
        });
      }

      return incident;
    });
  }

  async list(query: ListIncidentsQueryDto) {
    return this.prisma.incidentReport.findMany({
      where: {
        type: query.type,
        severity: query.severity,
        status: query.status,
        patientId: query.patientId,
        machineId: query.machineId,
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
      include: INCIDENT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const incident = await this.prisma.incidentReport.findUnique({ where: { id }, include: INCIDENT_INCLUDE });
    if (!incident) {
      throw new NotFoundException("Incident report not found");
    }
    return incident;
  }

  // The only status-changing path - there is deliberately no PATCH/PUT that
  // could silently overwrite status without a tracked IncidentStatusHistory
  // row (docs/MODULES-SPEC.md: "Append-or-Amend فقط").
  async updateStatus(id: string, dto: UpdateIncidentStatusDto, actor: AuthenticatedUser) {
    const incident = await this.requireIncident(id);
    const allowed = ALLOWED_INCIDENT_TRANSITIONS[incident.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Cannot move an incident from ${incident.status} to ${dto.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic and conditional on the status being unchanged since it was
      // read above (same pattern as MaintenanceService.updateStatus) - two
      // concurrent reviewers acting on the same OPEN incident can't both
      // succeed and leave two contradictory history rows.
      const result = await tx.incidentReport.updateMany({
        where: { id, status: incident.status },
        data: { status: dto.status },
      });
      if (result.count === 0) {
        throw new ConflictException("This incident's status changed since it was read");
      }

      await tx.incidentStatusHistory.create({
        data: {
          incidentId: id,
          fromStatus: incident.status,
          toStatus: dto.status,
          changedById: actor.id,
          reason: dto.reason,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "INCIDENT_STATUS_CHANGED",
          entityType: "IncidentReport",
          entityId: id,
          oldValue: { status: incident.status },
          newValue: { status: dto.status },
          reason: dto.reason,
        },
        tx,
      );

      // Read back after the history row exists, so the response's own
      // statusHistory array includes the transition that was just made.
      return tx.incidentReport.findUniqueOrThrow({ where: { id }, include: INCIDENT_INCLUDE });
    });
  }
}
