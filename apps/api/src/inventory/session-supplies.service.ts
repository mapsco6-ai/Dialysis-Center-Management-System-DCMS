import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SetSessionOverrideDto } from "./dto/set-session-override.dto";
import { SubstituteSupplyDto } from "./dto/substitute-supply.dto";
import { isUniqueConstraintOn } from "../patients/prisma-errors.util";

interface ResolvedSupplyLine {
  itemId: string;
  quantity: number;
  isOverridden: boolean;
}

@Injectable()
export class SessionSuppliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async requireSchedule(scheduleId: string) {
    const schedule = await this.prisma.dialysisSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) {
      throw new NotFoundException("Schedule entry not found");
    }
    return schedule;
  }

  private async requireMainWarehouse() {
    return this.prisma.stockLocation.findUniqueOrThrow({ where: { type: "MAIN_WAREHOUSE" } });
  }

  // Profile defaults with any session-specific override layered on top -
  // the override never touches the patient's stored profile (docs/MODULES-SPEC.md
  // Phase 4 acceptance criterion 2).
  private async resolveSupplyLines(scheduleId: string, patientId: string): Promise<ResolvedSupplyLine[]> {
    const [profile, overrides] = await Promise.all([
      this.prisma.patientSupplyProfile.findMany({ where: { patientId } }),
      this.prisma.sessionSupplyOverride.findMany({ where: { scheduleId } }),
    ]);
    const overrideMap = new Map(overrides.map((o) => [o.itemId, o]));

    const lines: ResolvedSupplyLine[] = profile.map((p) => {
      const override = overrideMap.get(p.itemId);
      return {
        itemId: p.itemId,
        quantity: Number(override ? override.overrideQuantity : p.defaultQuantity),
        isOverridden: Boolean(override),
      };
    });

    // An override can also introduce an item that isn't in the standing
    // profile at all - a one-off addition just for this session.
    for (const override of overrides) {
      if (!profile.some((p) => p.itemId === override.itemId)) {
        lines.push({ itemId: override.itemId, quantity: Number(override.overrideQuantity), isOverridden: true });
      }
    }

    return lines;
  }

  async getSessionSupplies(scheduleId: string) {
    const schedule = await this.requireSchedule(scheduleId);
    const [resolved, issued] = await Promise.all([
      this.resolveSupplyLines(scheduleId, schedule.patientId),
      this.prisma.sessionSupplyIssueItem.findMany({
        where: { scheduleId },
        include: { item: true, substituteForItem: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const issuedItemIds = new Set(issued.map((row) => row.itemId));
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: resolved.map((r) => r.itemId) } },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    return {
      pending: resolved
        .filter((line) => !issuedItemIds.has(line.itemId))
        .map((line) => ({ ...line, item: itemById.get(line.itemId) })),
      issued,
    };
  }

  async setOverride(scheduleId: string, dto: SetSessionOverrideDto, actor: AuthenticatedUser) {
    const schedule = await this.requireSchedule(scheduleId);
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: dto.itemId } });
    if (!item) {
      throw new BadRequestException("Inventory item not found");
    }
    const alreadyIssued = await this.prisma.sessionSupplyIssueItem.findUnique({
      where: { scheduleId_itemId: { scheduleId, itemId: dto.itemId } },
    });
    if (alreadyIssued) {
      throw new ConflictException("This item was already issued for this session - override no longer applies");
    }

    return this.prisma.$transaction(async (tx) => {
      const override = await tx.sessionSupplyOverride.upsert({
        where: { scheduleId_itemId: { scheduleId, itemId: dto.itemId } },
        update: { overrideQuantity: dto.overrideQuantity, reason: dto.reason },
        create: {
          scheduleId,
          itemId: dto.itemId,
          overrideQuantity: dto.overrideQuantity,
          reason: dto.reason,
          createdById: actor.id,
        },
        include: { item: true },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "SESSION_SUPPLY_OVERRIDE_SET",
          entityType: "DialysisSchedule",
          entityId: scheduleId,
          newValue: { itemId: dto.itemId, overrideQuantity: dto.overrideQuantity, reason: dto.reason },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: schedule.patientId,
          type: "SESSION_SUPPLY_OVERRIDE_SET",
          payload: { scheduleId, itemId: dto.itemId, overrideQuantity: dto.overrideQuantity },
          performedById: actor.id,
          sourceModule: "inventory",
        },
      });

      return override;
    });
  }

  // Processes lines with no issue record yet, plus any still UNAVAILABLE -
  // a prior shortage is retried (e.g. after a stock top-up) instead of being
  // excluded forever once it exists (docs review DCMS-043). ISSUED/
  // SUBSTITUTED lines are never touched again - safe to call repeatedly.
  async confirmIssue(scheduleId: string, actor: AuthenticatedUser) {
    const schedule = await this.requireSchedule(scheduleId);
    if (schedule.status !== "ARRIVED" && schedule.status !== "LATE") {
      throw new ConflictException(
        `Cannot issue supplies while the schedule is ${schedule.status} - the patient must have arrived`,
      );
    }
    const warehouse = await this.requireMainWarehouse();
    const resolved = await this.resolveSupplyLines(scheduleId, schedule.patientId);

    const existingRecords = await this.prisma.sessionSupplyIssueItem.findMany({
      where: { scheduleId },
      select: { itemId: true, status: true },
    });
    const recordByItemId = new Map(existingRecords.map((r) => [r.itemId, r.status]));
    const toProcess = resolved.filter((line) => {
      const existingStatus = recordByItemId.get(line.itemId);
      return !existingStatus || existingStatus === "UNAVAILABLE";
    });

    for (const line of toProcess) {
      await this.prisma.$transaction(async (tx) => {
        // Atomic and conditional on sufficient stock - two concurrent
        // confirm-issue calls drawing on the same scarce item can't both
        // succeed past zero (same pattern as the Phase 3 check-in fix).
        const result = await tx.stockBalance.updateMany({
          where: { itemId: line.itemId, locationId: warehouse.id, quantity: { gte: line.quantity } },
          data: { quantity: { decrement: line.quantity } },
        });

        const status = result.count === 1 ? "ISSUED" : "UNAVAILABLE";
        const quantityIssued = result.count === 1 ? line.quantity : 0;

        // Upsert, not create: a retried shortage already has an UNAVAILABLE
        // row for this (scheduleId, itemId) pair from the previous attempt.
        const issueItem = await tx.sessionSupplyIssueItem.upsert({
          where: { scheduleId_itemId: { scheduleId, itemId: line.itemId } },
          create: {
            scheduleId,
            itemId: line.itemId,
            quantityRequested: line.quantity,
            quantityIssued,
            status,
            performedById: actor.id,
          },
          update: {
            quantityRequested: line.quantity,
            quantityIssued,
            status,
            performedById: actor.id,
          },
        });

        if (status === "ISSUED") {
          await tx.stockMovement.create({
            data: {
              itemId: line.itemId,
              fromLocationId: warehouse.id,
              quantity: line.quantity,
              movementType: "ISSUE",
              relatedScheduleId: scheduleId,
              performedById: actor.id,
            },
          });
        }

        await this.auditService.log(
          {
            actorId: actor.id,
            actorRole: actor.roles[0] ?? "UNKNOWN",
            action: status === "ISSUED" ? "SESSION_SUPPLY_ISSUED" : "SESSION_SUPPLY_UNAVAILABLE",
            entityType: "SessionSupplyIssueItem",
            entityId: issueItem.id,
            newValue: { itemId: line.itemId, quantity: line.quantity, status },
          },
          tx,
        );

        await tx.patientTimelineEvent.create({
          data: {
            patientId: schedule.patientId,
            type: status === "ISSUED" ? "SUPPLY_ISSUED" : "SUPPLY_UNAVAILABLE",
            payload: { scheduleId, itemId: line.itemId, quantity: line.quantity },
            performedById: actor.id,
            sourceModule: "inventory",
          },
        });
      });
    }

    return this.getSessionSupplies(scheduleId);
  }

  async substitute(scheduleId: string, dto: SubstituteSupplyDto, actor: AuthenticatedUser) {
    const schedule = await this.requireSchedule(scheduleId);
    if (schedule.status !== "ARRIVED" && schedule.status !== "LATE") {
      throw new ConflictException(
        `Cannot substitute supplies while the schedule is ${schedule.status} - the patient must have arrived`,
      );
    }
    const warehouse = await this.requireMainWarehouse();

    const originalRecord = await this.prisma.sessionSupplyIssueItem.findUnique({
      where: { scheduleId_itemId: { scheduleId, itemId: dto.originalItemId } },
    });
    if (!originalRecord || originalRecord.status !== "UNAVAILABLE") {
      throw new BadRequestException(
        "Can only substitute for an item that was confirmed UNAVAILABLE for this session",
      );
    }
    // A shortage is covered by exactly one substitute - a second one for the
    // same original would double-issue against a need that's already met
    // (docs review DCMS-044).
    const alreadyCovered = await this.prisma.sessionSupplyIssueItem.findFirst({
      where: { scheduleId, substituteForItemId: dto.originalItemId },
    });
    if (alreadyCovered) {
      throw new ConflictException("This shortage was already covered by a substitute");
    }
    const existingForSubstitute = await this.prisma.sessionSupplyIssueItem.findUnique({
      where: { scheduleId_itemId: { scheduleId, itemId: dto.substituteItemId } },
    });
    if (existingForSubstitute) {
      throw new ConflictException("The substitute item already has an issue record for this session");
    }
    const substituteItem = await this.prisma.inventoryItem.findUnique({ where: { id: dto.substituteItemId } });
    if (!substituteItem) {
      throw new BadRequestException("Substitute item not found");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Same atomic guard as confirmIssue - a substitute with no real stock
        // behind it is exactly the "silent substitution" the doc forbids.
        const result = await tx.stockBalance.updateMany({
          where: { itemId: dto.substituteItemId, locationId: warehouse.id, quantity: { gte: dto.quantity } },
          data: { quantity: { decrement: dto.quantity } },
        });
        if (result.count === 0) {
          throw new ConflictException("The substitute item does not have enough stock either");
        }

        const issueItem = await tx.sessionSupplyIssueItem.create({
          data: {
            scheduleId,
            itemId: dto.substituteItemId,
            quantityRequested: dto.quantity,
            quantityIssued: dto.quantity,
            status: "SUBSTITUTED",
            substituteForItemId: dto.originalItemId,
            reason: dto.reason,
            performedById: actor.id,
          },
          include: { item: true, substituteForItem: true },
        });

        await tx.stockMovement.create({
          data: {
            itemId: dto.substituteItemId,
            fromLocationId: warehouse.id,
            quantity: dto.quantity,
            movementType: "ISSUE",
            relatedScheduleId: scheduleId,
            reason: `Substitute for ${dto.originalItemId}: ${dto.reason}`,
            performedById: actor.id,
          },
        });

        await this.auditService.log(
          {
            actorId: actor.id,
            actorRole: actor.roles[0] ?? "UNKNOWN",
            action: "SESSION_SUPPLY_SUBSTITUTED",
            entityType: "SessionSupplyIssueItem",
            entityId: issueItem.id,
            newValue: {
              originalItemId: dto.originalItemId,
              substituteItemId: dto.substituteItemId,
              quantity: dto.quantity,
            },
            reason: dto.reason,
          },
          tx,
        );

        await tx.patientTimelineEvent.create({
          data: {
            patientId: schedule.patientId,
            type: "SUPPLY_SUBSTITUTED",
            payload: {
              scheduleId,
              originalItemId: dto.originalItemId,
              substituteItemId: dto.substituteItemId,
              quantity: dto.quantity,
              reason: dto.reason,
            },
            performedById: actor.id,
            sourceModule: "inventory",
          },
        });

        return issueItem;
      });
    } catch (error) {
      if (isUniqueConstraintOn(error, "substituteForItemId")) {
        throw new ConflictException("This shortage was already covered by a substitute");
      }
      throw error;
    }
  }
}
