import { jest } from "@jest/globals";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { SessionsService } from "./sessions.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = () => jest.fn<(...args: any[]) => any>();

const admin: AuthenticatedUser = {
  id: "admin-1", username: "admin", fullName: "Admin", roles: ["SUPER_ADMIN"],
  permissions: ["dialysis.start", "dialysis.end", "dialysis.pre.record"], landingPath: "/admin", mustChangePassword: false,
};
// Restricted nursing tier: holds nursing.ward.view but not .all.
const nurse: AuthenticatedUser = { ...admin, id: "nurse-1", roles: ["NURSE"], permissions: [...admin.permissions, "nursing.ward.view"] };

const schedule = { id: "sch-1", patientId: "p-1", shiftId: "sh-1", status: "ARRIVED", machineId: "m-1" };
const session = (status: string, extra: object = {}) => ({
  id: "ses-1", scheduleId: "sch-1", patientId: "p-1", status, wardId: null, machineId: "m-1",
  preWeight: 80, preBP: "120/80", prePulse: 70, startTime: new Date(), ...extra,
});

function makeService() {
  const prisma = {
    dialysisSession: { findUnique: fn(), findUniqueOrThrow: fn(), updateMany: fn(), create: fn() },
    dialysisSchedule: { findUnique: fn(), findUniqueOrThrow: fn(), updateMany: fn() },
    machine: { findUniqueOrThrow: fn() },
    machineUsageApprovalRequest: { findMany: fn(), updateMany: fn(), count: fn() },
    patientTimelineEvent: { create: fn() },
    dialysisEvent: { create: fn() },
  };
  (prisma as { $transaction?: unknown }).$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  prisma.dialysisSchedule.findUniqueOrThrow.mockResolvedValue(schedule);
  prisma.machineUsageApprovalRequest.findMany.mockResolvedValue([]);
  const machines = { transitionStatus: fn() };
  const assignments = { isPatientAssignedToNurseOnDate: fn().mockResolvedValue(false) };
  const service = new SessionsService(prisma as never, { log: fn() } as never, machines as never, assignments as never, {} as never, { emit: fn() } as never);
  return { service, prisma, machines };
}

describe("SessionsService transitions are conditional (no double start/end/discharge)", () => {
  it("start: a request that loses the race gets 409 and never touches the machine", async () => {
    const { service, prisma, machines } = makeService();
    prisma.dialysisSession.findUnique.mockResolvedValue(session("ASSIGNED"));
    prisma.machine.findUniqueOrThrow.mockResolvedValue({ id: "m-1", status: "RESERVED", wardId: "w-1" });
    prisma.dialysisSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.start("sch-1", { dialyzerType: "F8", bloodLineType: "s", prescribedDurationMinutes: 240, requiredUF: 2 }, admin))
      .rejects.toBeInstanceOf(ConflictException);
    expect(machines.transitionStatus).not.toHaveBeenCalled();
    expect(prisma.patientTimelineEvent.create).not.toHaveBeenCalled();
  });

  it.each([
    ["end", "IN_DIALYSIS", (s: SessionsService) => s.end("sch-1", { postWeight: 78, postBP: "120/80", postPulse: 70, actualUF: 2 }, admin)],
    ["discharge", "COMPLETED", (s: SessionsService) => s.discharge("sch-1", admin)],
    ["resume", "INTERRUPTED", (s: SessionsService) => s.resume("sch-1", admin)],
  ])("%s: 409 when the row already moved", async (_name, status, call) => {
    const { service, prisma } = makeService();
    prisma.dialysisSession.findUnique.mockResolvedValue(session(status));
    prisma.dialysisSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(call(service)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.patientTimelineEvent.create).not.toHaveBeenCalled();
  });
});

describe("SessionsService enforces the nurse roster on every state change", () => {
  it.each([
    ["start", "ASSIGNED", (s: SessionsService) => s.start("sch-1", { dialyzerType: "F8", bloodLineType: "s", prescribedDurationMinutes: 240, requiredUF: 2 }, nurse)],
    ["end", "IN_DIALYSIS", (s: SessionsService) => s.end("sch-1", { postWeight: 78, postBP: "120/80", postPulse: 70, actualUF: 2 }, nurse)],
    ["discharge", "COMPLETED", (s: SessionsService) => s.discharge("sch-1", nurse)],
    ["interrupt", "IN_DIALYSIS", (s: SessionsService) => s.interrupt("sch-1", "x", nurse)],
    ["supplies-ready", "PRE_DIALYSIS", (s: SessionsService) => s.confirmSuppliesReady("sch-1", nurse)],
  ])("%s: 403 for a nurse the patient isn't rostered to", async (_name, status, call) => {
    const { service, prisma } = makeService();
    prisma.dialysisSession.findUnique.mockResolvedValue(session(status));
    await expect(call(service)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.dialysisSession.updateMany).not.toHaveBeenCalled();
  });

  it("pre-dialysis and cancel: 403 too", async () => {
    const { service, prisma } = makeService();
    prisma.dialysisSchedule.findUnique.mockResolvedValue({ ...schedule, session: null });
    await expect(service.preDialysis("sch-1", { weight: 80, bp: "120/80", pulse: 70 }, nurse)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.cancel("sch-1", "left", nurse)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("SessionsService.cancel", () => {
  it("closes the appointment and session and releases the reserved machine", async () => {
    const { service, prisma, machines } = makeService();
    prisma.dialysisSchedule.findUnique.mockResolvedValue({ ...schedule, session: session("ASSIGNED") });
    prisma.dialysisSchedule.updateMany.mockResolvedValue({ count: 1 });
    prisma.dialysisSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.machine.findUniqueOrThrow.mockResolvedValue({ id: "m-1", status: "RESERVED" });
    await service.cancel("sch-1", "patient left", admin);
    expect(prisma.dialysisSchedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CANCELLED", machineId: null } }),
    );
    expect(prisma.dialysisSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CANCELLED", machineId: null } }),
    );
    expect(machines.transitionStatus).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "m-1" }), "AVAILABLE", admin, expect.any(String));
  });

  it("rejects pending approvals and frees a machine only they held", async () => {
    const { service, prisma, machines } = makeService();
    prisma.dialysisSchedule.findUnique.mockResolvedValue({ ...schedule, machineId: null, session: null });
    prisma.dialysisSchedule.updateMany.mockResolvedValue({ count: 1 });
    prisma.machineUsageApprovalRequest.findMany.mockResolvedValue([{ id: "a-1", machineId: "m-9" }]);
    prisma.machineUsageApprovalRequest.count.mockResolvedValue(0);
    prisma.machine.findUniqueOrThrow.mockResolvedValue({ id: "m-9", status: "APPROVAL_REQUIRED" });
    await service.cancel("sch-1", "patient left", admin);
    expect(prisma.machineUsageApprovalRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ decision: "REJECTED" }) }));
    expect(machines.transitionStatus).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "m-9" }), "AVAILABLE", admin, expect.any(String));
  });

  it("refuses once dialysis has started", async () => {
    const { service, prisma } = makeService();
    prisma.dialysisSchedule.findUnique.mockResolvedValue({ ...schedule, session: session("IN_DIALYSIS") });
    await expect(service.cancel("sch-1", "x", admin)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.dialysisSchedule.updateMany).not.toHaveBeenCalled();
  });
});
