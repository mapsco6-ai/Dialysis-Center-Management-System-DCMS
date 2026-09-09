import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { toAuthenticatedUser, USER_WITH_ROLES_INCLUDE } from "../auth/auth.utils";
import { isUniqueConstraintOn } from "../patients/prisma-errors.util";
import { toDateOnly } from "../scheduling/date.util";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";

// The permission SessionsService already treats as "on the nursing floor"
// (enforceNursingAssignment) - reused here so a nurseId can never be written
// to an assignment unless that account could actually act on it afterward
// (docs review DCMS-056: the candidate dropdown filtered by role name, but
// the write endpoint itself accepted any active user id unchecked).
const CLINICAL_NURSING_PERMISSION = "nursing.ward.view";

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
    const [ward, shift, nurseRecord] = await Promise.all([
      this.prisma.ward.findUnique({ where: { id: dto.wardId } }),
      this.prisma.shift.findUnique({ where: { id: dto.shiftId } }),
      this.prisma.user.findUnique({ where: { id: dto.nurseId }, include: USER_WITH_ROLES_INCLUDE }),
    ]);
    if (!ward) throw new BadRequestException("Ward not found");
    if (!shift) throw new BadRequestException("Shift not found");
    if (!nurseRecord) throw new BadRequestException("Nurse not found");
    if (!nurseRecord.isActive) throw new BadRequestException("Nurse account is inactive");
    if (!toAuthenticatedUser(nurseRecord).permissions.includes(CLINICAL_NURSING_PERMISSION)) {
      throw new BadRequestException("nurseId does not hold clinical nursing authority");
    }

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
  // acceptance criterion 5). shiftId is required and wardId checked when
  // known - date alone let a nurse assigned to SHIFT_2 act on a SHIFT_1
  // session for the same patient/day (DCMS-058), since a single day can
  // host multiple independent shift rosters.
  async isPatientAssignedToNurseOnDate(
    patientId: string,
    nurseId: string,
    date: Date,
    shiftId: string,
    wardId?: string | null,
  ): Promise<boolean> {
    const count = await this.prisma.nursingAssignmentPatient.count({
      where: { patientId, date, shiftId, ...(wardId ? { wardId } : {}), assignment: { nurseId } },
    });
    return count > 0;
  }
}
