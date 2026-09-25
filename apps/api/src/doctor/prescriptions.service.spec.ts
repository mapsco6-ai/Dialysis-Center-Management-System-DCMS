import { jest } from "@jest/globals";
import { PrescriptionsService } from "./prescriptions.service";

const actor = { id: "n1", roles: ["NURSE"] } as any;

function makeService(status: string) {
  const prisma = {
    prescription: { findUnique: jest.fn(async () => ({ id: "rx1", patientId: "p1", medicationName: "EPO", status })) },
    $transaction: jest.fn(async () => ({ id: "a1" })),
  };
  return { service: new PrescriptionsService(prisma as any, {} as any), prisma };
}

describe("PrescriptionsService.administer", () => {
  it.each(["ACTIVE", "DISPENSING", "STOPPED", "MODIFIED", "REJECTED_BY_PHARMACY"])("refuses a %s prescription", async (status) => {
    const { service, prisma } = makeService(status);
    await expect(service.administer("rx1", { doseGiven: "1" }, actor)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("records a DISPENSED prescription", async () => {
    const { service, prisma } = makeService("DISPENSED");
    await expect(service.administer("rx1", { doseGiven: "1" }, actor)).resolves.toEqual({ id: "a1" });
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
