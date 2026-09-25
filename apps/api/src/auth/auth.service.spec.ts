import { jest } from "@jest/globals";
import { AuthService } from "./auth.service";

function makeService(user: unknown) {
  const prisma = { user: { findUnique: jest.fn(async () => user), update: jest.fn(async () => ({})) } };
  const eventEmitter = { emit: jest.fn() };
  const service = new AuthService(prisma as any, {} as any, {} as any, {} as any, eventEmitter as any);
  return { service, prisma, eventEmitter };
}

describe("AuthService.requestPasswordReset", () => {
  const active = { id: "u1", fullName: "Nurse One", username: "nurse1", isActive: true, passwordResetRequestedAt: null };

  it("flags the account and notifies reset-capable admins", async () => {
    const { service, prisma, eventEmitter } = makeService(active);
    await service.requestPasswordReset(" nurse1 ");
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { username: "nurse1" } }));
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordResetRequestedAt: expect.any(Date) } });
    expect(eventEmitter.emit).toHaveBeenCalledWith("notify", expect.objectContaining({ permission: "user.reset_password", type: "PASSWORD_RESET_REQUEST" }));
  });

  it.each([
    ["unknown username", null],
    ["inactive account", { ...active, isActive: false }],
  ])("rejects %s", async (_label, user) => {
    const { service, prisma, eventEmitter } = makeService(user);
    await expect(service.requestPasswordReset("nurse1")).rejects.toThrow("User not found");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it("does not re-notify while a request is pending", async () => {
    const { service, prisma, eventEmitter } = makeService({ ...active, passwordResetRequestedAt: new Date() });
    await service.requestPasswordReset("nurse1");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
