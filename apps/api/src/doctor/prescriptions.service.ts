import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { AdministerMedicationDto } from "./dto/administer-medication.dto";

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listForPatient(patientId: string) {
    return this.prisma.prescription.findMany({
      where: { patientId },
      include: {
        doctor: { select: { id: true, fullName: true } },
        administrations: {
          include: { administeredBy: { select: { id: true, fullName: true } } },
          orderBy: { administeredAt: "desc" },
        },
        // Phase 10: so the same Medications view shows the full Prescribed
        // -> Dispensed -> Administered picture without a second fetch.
        dispenses: {
          include: { item: true, dispensedBy: { select: { id: true, fullName: true } } },
          orderBy: { dispensedAt: "desc" },
        },
        // Lets the UI find the ACTIVE order for a given prescription (the
        // one whose id it must stop/modify) without a separate lookup.
        orders: { select: { id: true, status: true }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      // ponytail: capped at the 500 most recent, newest-first - see the
      // matching note on LabOrdersService.listForPatient.
      take: 500,
    });
  }

  // What the doctor can prescribe: the pharmacy dispenses only an item whose
  // name exactly matches medicationName (PharmacyService.dispense), so the
  // picker offers catalog names instead of free text. Names only - the doctor
  // has no inventory.view, so no costs or stock levels leak through here.
  // ponytail: "Medication" category by convention; a real formulary flag when
  // the catalog grows (docs review DCMS-064).
  async listMedications() {
    return this.prisma.inventoryItem.findMany({
      where: { category: { equals: "Medication", mode: "insensitive" } },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    });
  }

  // Deliberately separate from the doctor-orders write path (docs/
  // MODULES-SPEC.md: "قاعدة Prescription ≠ Administration") - what was
  // ordered and what was actually given are always two independent facts.
  async administer(prescriptionId: string, dto: AdministerMedicationDto, actor: AuthenticatedUser) {
    const prescription = await this.prisma.prescription.findUnique({ where: { id: prescriptionId } });
    if (!prescription) {
      throw new NotFoundException("Prescription not found");
    }
    // Prescribed -> Dispensed -> Administered is a strict chain (docs/
    // PROJECT-PHASES-PLAN.md Phases 8 and 10): the nurse gives only what the
    // pharmacy has actually dispensed, so ACTIVE/DISPENSING are refused too,
    // not just STOPPED/MODIFIED/REJECTED (DCMS-063 was the opposite bug -
    // DISPENSED being refused).
    if (prescription.status !== "DISPENSED") {
      throw new ConflictException(
        prescription.status === "ACTIVE" || prescription.status === "DISPENSING"
          ? "This prescription has not been dispensed by the pharmacy yet"
          : `Cannot administer a prescription that is ${prescription.status}`,
      );
    }
    if (dto.sessionId) {
      const session = await this.prisma.dialysisSession.findUnique({ where: { id: dto.sessionId } });
      if (!session) {
        throw new BadRequestException("sessionId does not refer to an existing session");
      }
      // A session FK proves the row exists, not that it's this patient's
      // (DCMS-059) - without this an administration could attach to
      // another patient's dialysis session.
      if (session.patientId !== prescription.patientId) {
        throw new BadRequestException("sessionId does not belong to this patient");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const administration = await tx.medicationAdministration.create({
        data: { prescriptionId, administeredById: actor.id, doseGiven: dto.doseGiven, sessionId: dto.sessionId },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "MEDICATION_ADMINISTERED",
          entityType: "MedicationAdministration",
          entityId: administration.id,
          newValue: { prescriptionId, doseGiven: dto.doseGiven, sessionId: dto.sessionId ?? null },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: prescription.patientId,
          type: "MEDICATION_ADMINISTERED",
          payload: {
            prescriptionId,
            medicationName: prescription.medicationName,
            doseGiven: dto.doseGiven,
            sessionId: dto.sessionId ?? null,
          },
          performedById: actor.id,
          sourceModule: "doctor-orders",
        },
      });

      return administration;
    });
  }

  async listAdministrations(prescriptionId: string) {
    const prescription = await this.prisma.prescription.findUnique({ where: { id: prescriptionId } });
    if (!prescription) {
      throw new NotFoundException("Prescription not found");
    }
    return this.prisma.medicationAdministration.findMany({
      where: { prescriptionId },
      include: { administeredBy: { select: { id: true, fullName: true } } },
      orderBy: { administeredAt: "desc" },
    });
  }
}
