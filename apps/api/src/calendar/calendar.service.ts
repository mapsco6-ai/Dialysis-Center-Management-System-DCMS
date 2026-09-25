import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { TasksService } from "../tasks/tasks.service";
import { toDateOnly, todayDateOnly } from "../scheduling/date.util";

const PATIENT_SELECT = { select: { id: true, fullName: true, patientCode: true } } as const;
const MACHINE_SELECT = { select: { machineCode: true } } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

// Roles with their own patient roster (nurses, via NursingAssignment) see
// only their assigned patients on the calendar; everyone else (doctor,
// pharmacist, lab, admin...) has no such roster in this system, so they see
// the same day's full schedule the Appointments board already shows them -
// confirmed with the user rather than inventing a per-role patient list that
// doesn't exist anywhere in the data model.
const ROSTER_PERMISSIONS = ["nursing.ward.view", "nursing.assign"];
// ponytail: fixed staffing threshold; move to SystemSetting if centers differ.
const PATIENTS_PER_NURSE = 4;

type Patient = { id: string; fullName: string; patientCode: string };

// One piece of role-specific work on the calendar. `shiftId` is set when the
// work belongs to a specific dialysis session (blood draw, medication given
// on the machine); null means "sometime that day".
export type CalendarItem = {
  id: string;
  kind: "LAB_DRAW" | "LAB_PENDING" | "LAB_REVIEW" | "DISPENSE" | "MAINTENANCE" | "COVERAGE";
  date: Date;
  shiftId: string | null;
  detail: string;
  patient: Patient | null;
  urgent: boolean;
};

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
    const can = (...permissions: string[]) => permissions.some((p) => user.permissions.includes(p));

    const roster = can(...ROSTER_PERMISSIONS)
      ? await this.prisma.nursingAssignmentPatient.findMany({
          where: { assignment: { nurseId: user.id }, date: dateRange },
          select: { patientId: true, date: true, shiftId: true },
        })
      : null;
    const slotKey = (patientId: string, date: Date, shiftId: string) => `${patientId}|${date.toISOString()}|${shiftId}`;
    const rosterKeys = new Set(roster?.map((r) => slotKey(r.patientId, r.date, r.shiftId)));

    const [shifts, tasks, allSchedules] = await Promise.all([
      this.prisma.nursingAssignment.findMany({
        where: { nurseId: user.id, date: dateRange },
        include: { shift: true, ward: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
      }),
      this.tasksService.listMine(user, from.toISOString(), to.toISOString()),
      this.prisma.dialysisSchedule.findMany({
        where: { scheduledDate: dateRange, ...(roster && { patientId: { in: [...new Set(roster.map((r) => r.patientId))] } }) },
        include: {
          patient: PATIENT_SELECT,
          shift: true,
          machine: MACHINE_SELECT,
          session: { select: { status: true, machine: MACHINE_SELECT } },
        },
        orderBy: [{ scheduledDate: "asc" }, { shiftId: "asc" }],
      }),
    ]);
    const schedules = roster
      ? allSchedules.filter((s) => rosterKeys.has(slotKey(s.patientId, s.scheduledDate, s.shiftId)))
      : allSchedules;

    const alerts = schedules.length
      ? await this.prisma.clinicalAlert.groupBy({
          by: ["patientId"],
          where: { patientId: { in: [...new Set(schedules.map((s) => s.patientId))] }, resolvedAt: null },
          _count: true,
        })
      : [];
    const alertCount = new Map(alerts.map((a) => [a.patientId, a._count]));

    const appointments = schedules.map((s) => ({
      scheduleId: s.id,
      date: s.scheduledDate,
      patient: s.patient,
      shift: s.shift,
      status: s.status,
      sessionStatus: s.session?.status ?? null,
      machineCode: s.session?.machine?.machineCode ?? s.machine?.machineCode ?? null,
      alertCount: alertCount.get(s.patientId) ?? 0,
    }));

    // Open work is about now and later, never the past: it lands on the
    // patient's next session from today (so a draw or a dose shows up in the
    // shift where it actually happens), else on today, else - when the
    // viewed range is entirely past or future - nowhere.
    const today = todayDateOnly();
    const place = (patientId: string | null, createdAt: Date) => {
      const since = new Date(Math.max(toDateOnly(createdAt).getTime(), today.getTime()));
      const session = patientId
        ? schedules.find((s) => s.patientId === patientId && s.scheduledDate >= since && s.status !== "CANCELLED")
        : undefined;
      if (session) return { date: session.scheduledDate, shiftId: session.shiftId };
      return since >= from && since <= to ? { date: since, shiftId: null } : null;
    };

    const items: CalendarItem[] = [];
    const push = (spot: { date: Date; shiftId: string | null } | null, item: Omit<CalendarItem, "date" | "shiftId">) => {
      if (spot) items.push({ ...spot, ...item });
    };

    if (can("lab.result.create")) {
      const labItems = await this.prisma.labOrderItem.findMany({
        where: { status: { notIn: ["FINAL", "AMENDED", "CANCELLED"] } },
        include: {
          labTest: { select: { name: true } },
          labOrder: { select: { id: true, orderedAt: true, patient: PATIENT_SELECT } },
        },
      });
      const orders = new Map<string, typeof labItems>();
      for (const item of labItems) orders.set(item.labOrderId, [...(orders.get(item.labOrderId) ?? []), item]);
      for (const [orderId, orderItems] of orders) {
        const { orderedAt, patient } = orderItems[0].labOrder;
        const needsDraw = orderItems.some((i) => i.status === "ORDERED" || i.status === "SAMPLE_REJECTED");
        push(needsDraw ? place(patient.id, orderedAt) : place(null, orderedAt), {
          id: `lab-${orderId}`,
          kind: needsDraw ? "LAB_DRAW" : "LAB_PENDING",
          detail: orderItems.map((i) => i.labTest.name).join("، "),
          patient,
          urgent: orderItems.some((i) => i.status === "SAMPLE_REJECTED"),
        });
      }
    }

    if (can("prescription.create")) {
      // Results that came back in range on orders this doctor placed - one
      // entry per order per day, flagged when any result is critical.
      const results = await this.prisma.labResult.findMany({
        where: {
          createdAt: { gte: from, lt: new Date(to.getTime() + DAY_MS) },
          labOrderItem: { labOrder: { orderedByDoctorId: user.id } },
        },
        select: {
          isCritical: true,
          createdAt: true,
          labOrderItem: { select: { labOrder: { select: { id: true, episodeCode: true, patient: PATIENT_SELECT } } } },
        },
      });
      const reviews = new Map<string, CalendarItem>();
      for (const result of results) {
        const order = result.labOrderItem.labOrder;
        const date = toDateOnly(result.createdAt);
        const key = `${order.id}|${date.toISOString()}`;
        const review: CalendarItem = reviews.get(key) ?? {
          id: `review-${key}`, kind: "LAB_REVIEW", date, shiftId: null, detail: order.episodeCode, patient: order.patient, urgent: false,
        };
        review.urgent ||= result.isCritical;
        reviews.set(key, review);
      }
      items.push(...reviews.values());
    }

    if (can("pharmacy.dispense")) {
      const prescriptions = await this.prisma.prescription.findMany({
        where: { status: { in: ["ACTIVE", "DISPENSING"] } },
        select: { id: true, createdAt: true, medicationName: true, dose: true, patient: PATIENT_SELECT },
      });
      for (const p of prescriptions) {
        push(place(p.patient.id, p.createdAt), {
          id: `rx-${p.id}`, kind: "DISPENSE", detail: `${p.medicationName} ${p.dose}`, patient: p.patient, urgent: false,
        });
      }
    }

    if (can("maintenance.manage")) {
      const tickets = await this.prisma.maintenanceTicket.findMany({
        where: {
          status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
          OR: [{ assignedToId: user.id }, { assignedToId: null }],
        },
        select: { id: true, createdAt: true, problem: true, severity: true, machine: MACHINE_SELECT },
      });
      for (const ticket of tickets) {
        push(place(null, ticket.createdAt), {
          id: `ticket-${ticket.id}`,
          kind: "MAINTENANCE",
          detail: `${ticket.machine.machineCode} · ${ticket.problem}`,
          patient: null,
          urgent: ticket.severity === "HIGH" || ticket.severity === "CRITICAL",
        });
      }
    }

    if (can("nursing.assign", "shift.manage")) {
      // Staffing coverage per shift: whole-center patients vs nurses on duty.
      const [patients, nurses] = await Promise.all([
        this.prisma.dialysisSchedule.groupBy({
          by: ["scheduledDate", "shiftId"],
          where: { scheduledDate: dateRange, status: { notIn: ["CANCELLED", "ABSENT", "RESCHEDULED"] } },
          _count: true,
        }),
        this.prisma.nursingAssignment.groupBy({ by: ["date", "shiftId"], where: { date: dateRange }, _count: true }),
      ]);
      const nurseCount = new Map(nurses.map((n) => [`${n.date.toISOString()}|${n.shiftId}`, n._count]));
      for (const slot of patients) {
        const onDuty = nurseCount.get(`${slot.scheduledDate.toISOString()}|${slot.shiftId}`) ?? 0;
        items.push({
          id: `coverage-${slot.scheduledDate.toISOString()}-${slot.shiftId}`,
          kind: "COVERAGE",
          date: slot.scheduledDate,
          shiftId: slot.shiftId,
          detail: `${onDuty}/${slot._count}`,
          patient: null,
          urgent: slot._count > onDuty * PATIENTS_PER_NURSE,
        });
      }
    }

    return { from: fromStr, to: toStr, shifts, tasks, appointments, items };
  }
}
