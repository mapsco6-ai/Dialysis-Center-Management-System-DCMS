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

function makeService() {
  const prisma = {
    nursingAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    nursingAssignmentPatient: { findMany: jest.fn().mockResolvedValue([]) },
    dialysisSchedule: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const tasksService = { listMine: jest.fn().mockResolvedValue([]) };
  const service = new CalendarService(prisma as never, tasksService as never);
  return { service, prisma, tasksService };
}

describe("CalendarService.getMyCalendar", () => {
  it("rejects a range where `from` is after `to`", async () => {
    const { service } = makeService();
    await expect(service.getMyCalendar(makeUser([]), "2026-02-10", "2026-02-01")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("uses the nurse's own roster (not the full day) when they hold a ward permission", async () => {
    const { service, prisma } = makeService();
    await service.getMyCalendar(makeUser(["nursing.ward.view"]), "2026-02-01", "2026-02-07");
    expect(prisma.nursingAssignmentPatient.findMany).toHaveBeenCalled();
    expect(prisma.dialysisSchedule.findMany).not.toHaveBeenCalled();
  });

  it("falls back to the full day's schedule for roles with no roster of their own", async () => {
    const { service, prisma } = makeService();
    await service.getMyCalendar(makeUser(["prescription.create"]), "2026-02-01", "2026-02-07");
    expect(prisma.dialysisSchedule.findMany).toHaveBeenCalled();
    expect(prisma.nursingAssignmentPatient.findMany).not.toHaveBeenCalled();
  });
});
