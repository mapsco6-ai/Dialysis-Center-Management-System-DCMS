import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { isUniqueConstraintOn } from "../patients/prisma-errors.util";
import { toDateOnly } from "../scheduling/date.util";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";

const ASSIGNMENT_INCLUDE = {
  ward: true,
  shift: true,
  nurse: { select: { id: true, fullName: true } },
  patients: { include: { patient: { select: { id: true, fullName: true, patientCode: true } } } },
} as const;

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async upsert(dto: CreateAssignmentDto, actor: AuthenticatedUser) {
    const date = toDateOnly(dto.date);
    const [ward, shift, nurse] = await Promise.all([
      this.prisma.ward.findUnique({ where: { id: dto.wardId } }),
      this.prisma.shift.findUnique({ where: { id: dto.shiftId } }),
      this.prisma.user.findUnique({ where: { id: dto.nurseId } }),
    ]);
    if (!ward) throw new BadRequestException("Ward not found");
    if (!shift) throw new BadRequestException("Shift not found");
    if (!nurse) throw new BadRequestException("Nurse not found");
    if (!nurse.isActive) throw new BadRequestException("Nurse account is inactive");

    const uniquePatientIds = [...new Set(dto.patientIds)];
    if (uniquePatientIds.length > 0) {
      const count = await this.prisma.patient.count({ where: { id: { in: uniquePatientIds } } });
      if (count !== uniquePatientIds.length) {
        throw new BadRequestException("One or more patientIds do not exist");
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.nursingAssignment.upsert({
          where: {
            wardId_shiftId_date_nurseId: { wardId: dto.wardId, shiftId: dto.shiftId, date, nurseId: dto.nurseId },
          },
          update: {},
          create: { wardId: dto.wardId, shiftId: dto.shiftId, date, nurseId: dto.nurseId, createdById: actor.id },
        });

        // Replace the patient list wholesale - each insert goes through the
        // (patientId, wardId, shiftId, date) unique constraint, so a patient
        // already claimed by another nurse for this exact slot is rejected
        // atomically rather than by a check-then-write race (docs/
        // MODULES-SPEC.md Phase 7: "لا تعارض").
        await tx.nursingAssignmentPatient.deleteMany({ where: { assignmentId: assignment.id } });
        if (uniquePatientIds.length > 0) {
          await tx.nursingAssignmentPatient.createMany({
            data: uniquePatientIds.map((patientId) => ({
              assignmentId: assignment.id,
              patientId,
              wardId: dto.wardId,
              shiftId: dto.shiftId,
              date,
            })),
          });
        }

        await this.auditService.log(
          {
            actorId: actor.id,
            actorRole: actor.roles[0] ?? "UNKNOWN",
            action: "NURSING_ASSIGNMENT_SET",
            entityType: "NursingAssignment",
            entityId: assignment.id,
            newValue: { wardId: dto.wardId, shiftId: dto.shiftId, date, nurseId: dto.nurseId, patientIds: uniquePatientIds },
          },
          tx,
        );

        return tx.nursingAssignment.findUniqueOrThrow({ where: { id: assignment.id }, include: ASSIGNMENT_INCLUDE });
      });
    } catch (error) {
      if (isUniqueConstraintOn(error, "patientId")) {
        throw new ConflictException(
          "One or more patients are already assigned to another nurse for this ward/shift/date",
        );
      }
      throw error;
    }
  }

  async listForWard(wardId: string, shiftId: string | undefined, dateStr: string) {
    const date = toDateOnly(dateStr);
    return this.prisma.nursingAssignment.findMany({
      where: { wardId, date, ...(shiftId ? { shiftId } : {}) },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
  }

  // A head nurse assigning patients needs to pick from active nursing staff
  // without needing the broader user.view permission (a separate, much
  // wider Users-module concern) just to see who's on the floor.
  async listNurseCandidates() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, roles: { some: { role: { name: { in: ["NURSE", "HEAD_NURSE"] } } } } },
      select: { id: true, fullName: true, username: true },
      orderBy: { fullName: "asc" },
    });
    return users;
  }

  async listMine(actor: AuthenticatedUser, dateStr: string) {
    const date = toDateOnly(dateStr);
    return this.prisma.nursingAssignment.findMany({
      where: { nurseId: actor.id, date },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
  }

  // Used by SessionsService to enforce that a filtered nurse can only act on
  // patients actually assigned to them (docs/PROJECT-PHASES-PLAN.md Phase 7
  // acceptance criterion 5).
  async isPatientAssignedToNurseOnDate(patientId: string, nurseId: string, date: Date): Promise<boolean> {
    const count = await this.prisma.nursingAssignmentPatient.count({
      where: { patientId, date, assignment: { nurseId } },
    });
    return count > 0;
  }
}
