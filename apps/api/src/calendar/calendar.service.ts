import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { TasksService } from "../tasks/tasks.service";
import { toDateOnly } from "../scheduling/date.util";

const PATIENT_SELECT = { select: { id: true, fullName: true, patientCode: true } } as const;

// Roles with their own patient roster (nurses, via NursingAssignment) see
// only their assigned patients on the calendar; everyone else (doctor,
// pharmacist, lab, admin...) has no such roster in this system, so they see
// the same day's full schedule the Appointments board already shows them -
// confirmed with the user rather than inventing a per-role patient list that
// doesn't exist anywhere in the data model.
const ROSTER_PERMISSIONS = ["nursing.ward.view", "nursing.assign"];

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  async getMyCalendar(user: AuthenticatedUser, fromStr: string, toStr: string) {
    const from = toDateOnly(fromStr);
    const to = toDateOnly(toStr);
    if (from > to) {
      throw new BadRequestException("`from` must not be after `to`");
    }
    const dateRange = { gte: from, lte: to };

    const [shifts, tasks, appointments] = await Promise.all([
      this.prisma.nursingAssignment.findMany({
        where: { nurseId: user.id, date: dateRange },
        include: { shift: true, ward: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
      }),
      this.tasksService.listMine(user, from.toISOString(), to.toISOString()),
      user.permissions.some((p) => ROSTER_PERMISSIONS.includes(p))
        ? this.prisma.nursingAssignmentPatient
            .findMany({
              where: { assignment: { nurseId: user.id }, date: dateRange },
              include: { patient: PATIENT_SELECT, assignment: { include: { shift: true } } },
              orderBy: { date: "asc" },
            })
            .then((rows) =>
              rows.map((row) => ({
                date: row.date,
                patient: row.patient,
                shift: row.assignment.shift,
              })),
            )
        : this.prisma.dialysisSchedule
            .findMany({
              where: { scheduledDate: dateRange },
              include: { patient: PATIENT_SELECT, shift: true },
              orderBy: [{ scheduledDate: "asc" }, { shiftId: "asc" }],
            })
            .then((rows) =>
              rows.map((row) => ({
                date: row.scheduledDate,
                patient: row.patient,
                shift: row.shift,
                status: row.status,
              })),
            ),
    ]);

    return { from: fromStr, to: toStr, shifts, tasks, appointments };
  }
}
