import { jest } from "@jest/globals";
import { BadRequestException } from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";

function makeUser(permissions: string[]): AuthenticatedUser {
  return {
    id: "user-1",
    username: "u",
    fullName: "U",
    roles: [],
    permissions,
    landingPath: "/admin",
    mustChangePassword: false,
  };
}

const rows = (value: unknown[] = []) => jest.fn(async (_args?: unknown) => value);

const shift = { id: "s1", name: "SHIFT_1", dialysisStart: "07:00", dialysisEnd: "11:00" };
const patient = (id: string) => ({ id, fullName: id, patientCode: id });
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const schedule = (patientId: string, date: string, extra: object = {}) => ({
  id: `sch-${patientId}-${date}`,
  patientId,
  patient: patient(patientId),
  scheduledDate: day(date),
  shiftId: "s1",
  shift,
  status: "SCHEDULED",
  machine: null,
  session: null,
  ...extra,
});

function makeService(data: { roster?: unknown[]; schedules?: unknown[] } = {}) {
  const prisma = {
    nursingAssignment: { findMany: rows(), groupBy: rows() },
    nursingAssignmentPatient: { findMany: rows(data.roster) },
    dialysisSchedule: { findMany: rows(data.schedules), groupBy: rows() },
    clinicalAlert: { groupBy: rows([{ patientId: "p1", _count: 2 }]) },
    labOrderItem: { findMany: rows() },
    labResult: { findMany: rows() },
    prescription: { findMany: rows() },
    maintenanceTicket: { findMany: rows() },
  };
  const tasksService = { listMine: rows() };
  const service = new CalendarService(prisma as never, tasksService as never);
  return { service, prisma };
}

describe("CalendarService.getMyCalendar", () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date(2026, 1, 3, 9) });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it("rejects a range where `from` is after `to`", async () => {
    const { service } = makeService();
    await expect(service.getMyCalendar(makeUser([]), "2026-02-10", "2026-02-01")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("keeps only the nurse's own roster slots, with machine, session status and alerts", async () => {
    const { service } = makeService({
      roster: [{ patientId: "p1", date: day("2026-02-03"), shiftId: "s1" }],
      schedules: [
        schedule("p1", "2026-02-03", { session: { status: "IN_DIALYSIS", machine: { machineCode: "M-3" } } }),
        schedule("p1", "2026-02-05"),
      ],
    });
    const result = await service.getMyCalendar(makeUser(["nursing.ward.view"]), "2026-02-01", "2026-02-07");
    expect(result.appointments).toHaveLength(1);
    expect(result.appointments[0]).toMatchObject({ sessionStatus: "IN_DIALYSIS", machineCode: "M-3", alertCount: 2 });
  });

  it("shows the full schedule to roles with no roster and loads no role work they can't do", async () => {
    const { service, prisma } = makeService({ schedules: [schedule("p1", "2026-02-03"), schedule("p2", "2026-02-03")] });
    const result = await service.getMyCalendar(makeUser(["patient.view"]), "2026-02-01", "2026-02-07");
    expect(result.appointments).toHaveLength(2);
    expect(prisma.nursingAssignmentPatient.findMany).not.toHaveBeenCalled();
    expect(prisma.labOrderItem.findMany).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
  });

  it("puts a lab draw on the patient's next session from today, not a past one", async () => {
    const { service, prisma } = makeService({
      schedules: [schedule("p1", "2026-02-01"), schedule("p1", "2026-02-05")],
    });
    prisma.labOrderItem.findMany = rows([
      { labOrderId: "o1", status: "ORDERED", labTest: { name: "CBC" }, labOrder: { id: "o1", orderedAt: day("2026-01-20"), patient: patient("p1") } },
      { labOrderId: "o2", status: "PROCESSING", labTest: { name: "K" }, labOrder: { id: "o2", orderedAt: day("2026-01-20"), patient: patient("p9") } },
    ]);
    const result = await service.getMyCalendar(makeUser(["lab.result.create"]), "2026-02-01", "2026-02-07");
    expect(result.items).toEqual([
      expect.objectContaining({ kind: "LAB_DRAW", date: day("2026-02-05"), shiftId: "s1", detail: "CBC" }),
      expect.objectContaining({ kind: "LAB_PENDING", date: day("2026-02-03"), shiftId: null }),
    ]);
  });

  it("flags a shift as understaffed when patients exceed the per-nurse limit", async () => {
    const { service, prisma } = makeService();
    prisma.dialysisSchedule.groupBy = rows([{ scheduledDate: day("2026-02-03"), shiftId: "s1", _count: 9 }]);
    prisma.nursingAssignment.groupBy = rows([{ date: day("2026-02-03"), shiftId: "s1", _count: 2 }]);
    const result = await service.getMyCalendar(makeUser(["shift.manage"]), "2026-02-01", "2026-02-07");
    expect(result.items).toEqual([expect.objectContaining({ kind: "COVERAGE", detail: "2/9", urgent: true })]);
  });
});
