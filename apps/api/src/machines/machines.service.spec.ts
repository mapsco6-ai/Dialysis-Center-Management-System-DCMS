import { jest } from "@jest/globals";
import { ConflictException } from "@nestjs/common";
import { MachinesService } from "./machines.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = () => jest.fn<(...args: any[]) => any>();

const actor: AuthenticatedUser = {
  id: "u-1", username: "hn", fullName: "Head Nurse", roles: ["HEAD_NURSE"],
  permissions: ["machine.assign", "approval.machine.decide"], landingPath: "/admin", mustChangePassword: false,
};

function makeService() {
  const prisma = {
    dialysisSchedule: { findUnique: fn(), updateMany: fn() },
    dialysisSession: { updateMany: fn() },
    machine: { findUnique: fn(), findUniqueOrThrow: fn(), findMany: fn(), updateMany: fn() },
    machineStatusHistory: { create: fn() },
    machineUsageApprovalRequest: { findUnique: fn(), updateMany: fn(), findUniqueOrThrow: fn() },
    patientTimelineEvent: { create: fn() },
  };
  (prisma as { $transaction?: unknown }).$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  const service = new MachinesService(prisma as never, { log: fn() } as never, { emit: fn() } as never, {} as never);
  return { service, prisma };
}

describe("MachinesService assignment guards", () => {
  it("won't reserve a machine for a patient who hasn't checked in", async () => {
    const { service, prisma } = makeService();
    prisma.dialysisSchedule.findUnique.mockResolvedValue({ id: "s-1", status: "SCHEDULED", machineId: null });
    await expect(service.assignMachine("s-1", {} as never, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.machine.findMany).not.toHaveBeenCalled();
  });

  it("transitionStatus: 409 when the machine moved since it was read", async () => {
    const { service, prisma } = makeService();
    prisma.machine.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.transitionStatus(prisma as never, { id: "m-1", status: "AVAILABLE" }, "RESERVED", actor, "x"))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.machineStatusHistory.create).not.toHaveBeenCalled();
  });

  it("approving a request can't overwrite a machine the schedule already got", async () => {
    const { service, prisma } = makeService();
    prisma.machineUsageApprovalRequest.findUnique.mockResolvedValue({
      id: "a-1", decision: "PENDING", machineId: "m-A", scheduleId: "s-1", patientId: "p-1", schedule: { type: "REGULAR" },
    });
    prisma.machineUsageApprovalRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.machine.findUniqueOrThrow.mockResolvedValue({ id: "m-A", status: "APPROVAL_REQUIRED", isEmergencyDedicated: false });
    prisma.machine.updateMany.mockResolvedValue({ count: 1 });
    prisma.dialysisSchedule.updateMany.mockResolvedValue({ count: 0 }); // schedule already holds machine B
    await expect(service.decideApproval("a-1", { decision: "APPROVED" } as never, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.dialysisSession.updateMany).not.toHaveBeenCalled();
  });
});
