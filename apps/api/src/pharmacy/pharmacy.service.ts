import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrescriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { TransferToPharmacyDto } from "./dto/transfer-to-pharmacy.dto";
import { DispensePrescriptionDto } from "./dto/dispense-prescription.dto";

const PENDING_STATUSES: PrescriptionStatus[] = ["ACTIVE", "DISPENSING"];

const QUEUE_INCLUDE = {
  patient: { select: { id: true, fullName: true, patientCode: true } },
  doctor: { select: { id: true, fullName: true } },
  dispenses: { include: { item: true, dispensedBy: { select: { id: true, fullName: true } } } },
} as const;

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async requireLocations() {
    const [warehouse, pharmacy] = await Promise.all([
      this.prisma.stockLocation.findUniqueOrThrow({ where: { type: "MAIN_WAREHOUSE" } }),
      this.prisma.stockLocation.findUniqueOrThrow({ where: { type: "PHARMACY" } }),
    ]);
    return { warehouse, pharmacy };
  }

  private async requirePrescription(id: string) {
    const prescription = await this.prisma.prescription.findUnique({ where: { id } });
    if (!prescription) {
      throw new NotFoundException("Prescription not found");
    }
    return prescription;
  }

  // A simple stock-in for the pharmacy's own pool - the full multi-stage
  // StockTransfer workflow (REQUESTED/APPROVED/ISSUED/RECEIVED) is Phase 11
  // (docs/PROJECT-PHASES-PLAN.md: "أساس بسيط من الفيز 4، التحويل الكامل في
  // فيز 11").
  async transferToPharmacy(dto: TransferToPharmacyDto, actor: AuthenticatedUser) {
    const { warehouse, pharmacy } = await this.requireLocations();
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: dto.itemId } });
    if (!item) {
      throw new BadRequestException("Item not found");
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic and conditional on sufficient warehouse stock - same pattern
      // as every other stock deduction in this codebase.
      const result = await tx.stockBalance.updateMany({
        where: { itemId: dto.itemId, locationId: warehouse.id, quantity: { gte: dto.quantity } },
        data: { quantity: { decrement: dto.quantity } },
      });
      if (result.count === 0) {
        throw new ConflictException(`Not enough stock in the main warehouse to transfer ${dto.quantity}`);
      }

      await tx.stockBalance.upsert({
        where: { itemId_locationId: { itemId: dto.itemId, locationId: pharmacy.id } },
        create: { itemId: dto.itemId, locationId: pharmacy.id, quantity: dto.quantity },
        update: { quantity: { increment: dto.quantity } },
      });

      const movement = await tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          fromLocationId: warehouse.id,
          toLocationId: pharmacy.id,
          quantity: dto.quantity,
          movementType: "TRANSFER",
          reason: dto.reason,
          performedById: actor.id,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "STOCK_TRANSFERRED_TO_PHARMACY",
          entityType: "InventoryItem",
          entityId: dto.itemId,
          newValue: { quantity: dto.quantity },
          reason: dto.reason,
        },
        tx,
      );

      return movement;
    });
  }

  // Live query, not a cached projection - a prescription stopped/modified by
  // the doctor a moment ago disappears from here immediately, and nothing
  // downstream can dispense against it (docs/PROJECT-PHASES-PLAN.md Phase
  // 10 acceptance criterion 5).
  async listQueue(status?: PrescriptionStatus) {
    return this.prisma.prescription.findMany({
      where: { status: status ? status : { in: PENDING_STATUSES } },
      include: QUEUE_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
  }

  async startDispensing(prescriptionId: string, actor: AuthenticatedUser) {
    const prescription = await this.requirePrescription(prescriptionId);
    if (prescription.status !== "ACTIVE") {
      throw new ConflictException(`Cannot start dispensing a prescription that is ${prescription.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic and conditional on still being ACTIVE - closes the race
      // where a doctor stops/modifies it, or another pharmacist claims it,
      // at the same instant.
      const result = await tx.prescription.updateMany({
        where: { id: prescriptionId, status: "ACTIVE" },
        data: { status: "DISPENSING" },
      });
      if (result.count === 0) {
        throw new ConflictException("This prescription's status changed since it was read");
      }

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "PRESCRIPTION_DISPENSING_STARTED",
          entityType: "Prescription",
          entityId: prescriptionId,
          oldValue: { status: "ACTIVE" },
          newValue: { status: "DISPENSING" },
        },
        tx,
      );

      return tx.prescription.findUniqueOrThrow({ where: { id: prescriptionId }, include: QUEUE_INCLUDE });
    });
  }

  async dispense(prescriptionId: string, dto: DispensePrescriptionDto, actor: AuthenticatedUser) {
    const prescription = await this.requirePrescription(prescriptionId);
    if (prescription.status !== "DISPENSING") {
      throw new ConflictException(
        `Cannot dispense a prescription that is ${prescription.status} - call start-dispensing first`,
      );
    }
    const { pharmacy } = await this.requireLocations();
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: dto.itemId } });
    if (!item) {
      throw new BadRequestException("Item not found");
    }
    if (dto.linkedSessionId) {
      const session = await this.prisma.dialysisSession.findUnique({ where: { id: dto.linkedSessionId } });
      if (!session) {
        throw new BadRequestException("linkedSessionId does not refer to an existing session");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic and conditional on the prescription still being DISPENSING -
      // if a doctor stopped or modified it since start-dispensing (docs
      // review DCMS-047's reasoning applies identically here), this rolls
      // the whole transaction back rather than dispensing against a
      // superseded order (docs/MODULES-SPEC.md: "لا صرف لأمر قديم مُلغى").
      const prescriptionUpdate = await tx.prescription.updateMany({
        where: { id: prescriptionId, status: "DISPENSING" },
        data: { status: "DISPENSED" },
      });
      if (prescriptionUpdate.count === 0) {
        throw new ConflictException(
          "This prescription is no longer awaiting dispensing - it may have been stopped or modified",
        );
      }

      // Atomic and conditional on sufficient pharmacy stock - never
      // dispenses from a negative balance (docs/PROJECT-PHASES-PLAN.md
      // Phase 10 acceptance criterion 3).
      const stockResult = await tx.stockBalance.updateMany({
        where: { itemId: dto.itemId, locationId: pharmacy.id, quantity: { gte: dto.quantity } },
        data: { quantity: { decrement: dto.quantity } },
      });
      if (stockResult.count === 0) {
        throw new ConflictException(`Not enough pharmacy stock of ${item.name} to dispense ${dto.quantity}`);
      }

      const dispense = await tx.prescriptionDispense.create({
        data: {
          prescriptionId,
          itemId: dto.itemId,
          dispensedById: actor.id,
          quantity: dto.quantity,
          linkedSessionId: dto.linkedSessionId,
        },
      });

      await tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          fromLocationId: pharmacy.id,
          quantity: dto.quantity,
          movementType: "ISSUE",
          relatedPrescriptionId: prescriptionId,
          performedById: actor.id,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "PRESCRIPTION_DISPENSED",
          entityType: "Prescription",
          entityId: prescriptionId,
          newValue: { itemId: dto.itemId, quantity: dto.quantity, linkedSessionId: dto.linkedSessionId ?? null },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: prescription.patientId,
          type: "MEDICATION_DISPENSED",
          payload: {
            prescriptionId,
            medicationName: prescription.medicationName,
            itemId: dto.itemId,
            quantity: dto.quantity,
          },
          performedById: actor.id,
          sourceModule: "pharmacy",
        },
      });

      return dispense;
    });
  }

  // Patient 360's Medication History: Prescribed -> Dispensed -> Administered
  // for every medication, drawn straight from the three already-separate
  // records (docs/PROJECT-PHASES-PLAN.md Phase 10 acceptance criterion 4).
  async medicationHistory(patientId: string) {
    const prescriptions = await this.prisma.prescription.findMany({
      where: { patientId },
      include: {
        doctor: { select: { id: true, fullName: true } },
        dispenses: {
          include: { item: true, dispensedBy: { select: { id: true, fullName: true } } },
          orderBy: { dispensedAt: "asc" },
        },
        administrations: {
          include: { administeredBy: { select: { id: true, fullName: true } } },
          orderBy: { administeredAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return prescriptions.map((p) => ({
      id: p.id,
      medicationName: p.medicationName,
      dose: p.dose,
      frequency: p.frequency,
      duration: p.duration,
      status: p.status,
      prescribedAt: p.createdAt,
      prescribedBy: p.doctor,
      dispenses: p.dispenses,
      administrations: p.administrations,
    }));
  }
}
