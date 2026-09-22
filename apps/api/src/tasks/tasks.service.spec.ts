import { jest } from "@jest/globals";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1",
    username: "nurse1",
    fullName: "Nurse One",
    roles: ["NURSE"],
    permissions: [],
    landingPath: "/admin",
    mustChangePassword: false,
    ...overrides,
  };
}

// Prisma/audit/event-emitter are hand-mocked rather than wired through
// @nestjs/testing - the service takes them as plain constructor args, so a
// full DI module would only add ceremony here.
function makeService() {
  const prisma = {
    user: { findUnique: jest.fn() },
    role: { findUnique: jest.fn(), findMany: jest.fn() },
    patient: { findUnique: jest.fn() },
    userRole: { findMany: jest.fn() },
    task: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    taskStatusHistory: { create: jest.fn() },
  };
  // Assigned after the object exists (not inline) - referencing `prisma`
  // inside its own initializer confuses TS's type inference (TS7022).
  (prisma as { $transaction?: unknown }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  const audit = { log: jest.fn() };
  const emitter = { emit: jest.fn() };
  const service = new TasksService(prisma as never, audit as never, emitter as never);
  return { service, prisma, audit, emitter };
}

describe("TasksService.create", () => {
  it("rejects a task with neither an assignee nor a role", async () => {
    const { service } = makeService();
    await expect(service.create({ title: "x" } as never, makeUser())).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a task with both an assignee and a role", async () => {
    const { service } = makeService();
    await expect(
      service.create({ title: "x", assignedToId: "u2", assignedToRoleId: "r1" } as never, makeUser()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an inactive assignee", async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ id: "u2", isActive: false });
    await expect(
      service.create({ title: "x", assignedToId: "u2" } as never, makeUser()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a role that does not exist", async () => {
    const { service, prisma } = makeService();
    prisma.role.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ title: "x", assignedToRoleId: "r1" } as never, makeUser()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a task for a named, active assignee and notifies them", async () => {
    const { service, prisma, emitter } = makeService();
    prisma.user.findUnique.mockResolvedValue({ id: "u2", isActive: true });
    const created = { id: "task-1", title: "x", assignedToId: "u2", assignedToRoleId: null };
    prisma.task.create.mockResolvedValue(created);
    prisma.taskStatusHistory.create.mockResolvedValue({});

    const result = await service.create({ title: "x", assignedToId: "u2" } as never, makeUser());

    expect(result).toBe(created);
    expect(emitter.emit).toHaveBeenCalledWith(
      "notify",
      expect.objectContaining({ userIds: ["u2"], type: "TASK_ASSIGNED" }),
    );
  });
});

describe("TasksService.updateStatus", () => {
  it("rejects a transition that skips a stage", async () => {
    const { service, prisma } = makeService();
    prisma.task.findUnique.mockResolvedValue({ id: "t1", status: "OPEN", assignedToId: "user-1", assignedToRoleId: null, claimedById: null });
    await expect(service.updateStatus("t1", { status: "OPEN" } as never, makeUser())).rejects.toBeInstanceOf(ConflictException);
  });

  it("lets the assignee move OPEN -> IN_PROGRESS and claims the task", async () => {
    const { service, prisma } = makeService();
    prisma.task.findUnique.mockResolvedValue({ id: "t1", status: "OPEN", assignedToId: "user-1", assignedToRoleId: null, claimedById: null });
    prisma.task.updateMany.mockResolvedValue({ count: 1 });
    prisma.task.findUniqueOrThrow.mockResolvedValue({ id: "t1", status: "IN_PROGRESS" });

    await service.updateStatus("t1", { status: "IN_PROGRESS" } as never, makeUser());

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", status: "OPEN" },
      data: { status: "IN_PROGRESS", claimedById: "user-1" },
    });
  });

  it("hides a task from users outside its role broadcast and assignment", async () => {
    const { service, prisma } = makeService();
    prisma.task.findUnique.mockResolvedValue({ id: "t1", status: "OPEN", assignedToId: "someone-else", assignedToRoleId: null, claimedById: null });
    prisma.userRole.findMany.mockResolvedValue([]);
    await expect(service.updateStatus("t1", { status: "IN_PROGRESS" } as never, makeUser())).rejects.toThrow("Task not found");
  });
});

describe("TasksService.listMine", () => {
  it("matches tasks assigned to me or unclaimed tasks routed to my roles", async () => {
    const { service, prisma } = makeService();
    prisma.userRole.findMany.mockResolvedValue([{ roleId: "role-nurse" }]);
    prisma.task.findMany.mockResolvedValue([]);

    await service.listMine(makeUser());

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { assignedToId: "user-1" },
            expect.objectContaining({ assignedToRoleId: { in: ["role-nurse"] }, status: { not: "CANCELLED" } }),
          ],
        }),
      }),
    );
  });
});
