import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SetSupplyProfileDto } from "./dto/set-supply-profile.dto";

@Injectable()
export class PatientSupplyProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async requirePatient(patientId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }
  }

  async findAll(patientId: string) {
    await this.requirePatient(patientId);
    return this.prisma.patientSupplyProfile.findMany({
      where: { patientId },
      include: { item: true },
      orderBy: { createdAt: "asc" },
    });
  }

  // Plain upsert-per-entry (create or update defaultQuantity) - this is
  // current-state configuration, not versioned history, so there's no
  // "close out the old entries" step like DialysisPlan's setPlan.
  async setProfile(patientId: string, dto: SetSupplyProfileDto, actor: AuthenticatedUser) {
    await this.requirePatient(patientId);

    const itemIds = dto.entries.map((e) => e.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException("Duplicate itemId in supply profile entries");
    }
    const items = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== itemIds.length) {
      throw new BadRequestException("One or more itemIds do not exist");
    }

    return this.prisma.$transaction(async (tx) => {
      const results = await Promise.all(
        dto.entries.map((entry) =>
          tx.patientSupplyProfile.upsert({
            where: { patientId_itemId: { patientId, itemId: entry.itemId } },
            update: { defaultQuantity: entry.defaultQuantity },
            create: { patientId, itemId: entry.itemId, defaultQuantity: entry.defaultQuantity },
            include: { item: true },
          }),
        ),
      );

      const plainEntries = dto.entries.map((e) => ({ itemId: e.itemId, defaultQuantity: e.defaultQuantity }));

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "PATIENT_SUPPLY_PROFILE_SET",
          entityType: "Patient",
          entityId: patientId,
          newValue: { entries: plainEntries },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId,
          type: "SUPPLY_PROFILE_UPDATED",
          payload: { entries: plainEntries },
          performedById: actor.id,
          sourceModule: "inventory",
        },
      });

      return results;
    });
  }

  async removeItem(patientId: string, itemId: string, actor: AuthenticatedUser) {
    await this.requirePatient(patientId);
    const existing = await this.prisma.patientSupplyProfile.findUnique({
      where: { patientId_itemId: { patientId, itemId } },
    });
    if (!existing) {
      throw new NotFoundException("This item is not in the patient's supply profile");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.patientSupplyProfile.delete({ where: { patientId_itemId: { patientId, itemId } } });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "PATIENT_SUPPLY_PROFILE_ITEM_REMOVED",
          entityType: "Patient",
          entityId: patientId,
          oldValue: { itemId, defaultQuantity: existing.defaultQuantity },
        },
        tx,
      );
    });

    return { success: true };
  }
}
