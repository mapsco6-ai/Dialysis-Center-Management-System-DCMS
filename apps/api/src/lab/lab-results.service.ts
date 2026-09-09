import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { LabOrderItemStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { InventoryBatchesService } from "../inventory/inventory-batches.service";
import { LabOrdersService } from "./lab-orders.service";
import { UpdateItemStatusDto } from "./dto/update-item-status.dto";
import { EnterResultDto } from "./dto/enter-result.dto";
import { AmendResultDto } from "./dto/amend-result.dto";

// The two manual staff transitions - RESULT_ENTERED/FINAL are set together
// by enterResult() below (docs/MODULES-SPEC.md: "لا اعتماد ثانٍ حالياً - من
// يُدخل النتيجة يجعلها Final مباشرة"), so they never appear on this table.
const STATUS_TRANSITIONS: Partial<Record<LabOrderItemStatus, LabOrderItemStatus[]>> = {
  ORDERED: ["SAMPLE_COLLECTED"],
  SAMPLE_COLLECTED: ["PROCESSING"],
};

@Injectable()
export class LabResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly labOrdersService: LabOrdersService,
    private readonly batchesService: InventoryBatchesService,
  ) {}

  async updateStatus(itemId: string, dto: UpdateItemStatusDto, actor: AuthenticatedUser) {
    const item = await this.labOrdersService.requireOrderItem(itemId);
    const allowed = STATUS_TRANSITIONS[item.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Cannot go directly from ${item.status} to ${dto.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic and conditional on the status being unchanged since it was
      // read - closes a concurrent double-transition race (same pattern as
      // the Phase 3 check-in fix).
      const result = await tx.labOrderItem.updateMany({
        where: { id: itemId, status: item.status },
        data: { status: dto.status },
      });
      if (result.count === 0) {
        throw new ConflictException("This item's status changed since it was read");
      }

      // Sample collection is what physically consumes the test's
      // configured consumable, if one is configured (docs review Phase 11
      // acceptance criterion 6). Deliberately best-effort: an insufficient
      // or unconfigured consumable never blocks the clinical action of
      // actually collecting the sample - inventory bookkeeping doesn't get
      // to hold up patient care. A shortage here just means this test's
      // consumable cost isn't recorded for this order.
      if (dto.status === "SAMPLE_COLLECTED" && item.labTest.consumableItemId) {
        await this.consumeLabConsumable(tx, itemId, item.labTest.consumableItemId, Number(item.labTest.consumableQuantity), actor.id);
      }

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "LAB_ORDER_ITEM_STATUS_CHANGED",
          entityType: "LabOrderItem",
          entityId: itemId,
          oldValue: { status: item.status },
          newValue: { status: dto.status },
        },
        tx,
      );

      return tx.labOrderItem.findUniqueOrThrow({ where: { id: itemId }, include: { labTest: true } });
    });
  }

  private async consumeLabConsumable(
    tx: Prisma.TransactionClient,
    labOrderItemId: string,
    consumableItemId: string,
    quantity: number,
    performedById: string,
  ) {
    const labStock = await tx.stockLocation.findUnique({ where: { type: "LABORATORY_STOCK" } });
    if (!labStock) return;

    let batchesOk = true;
    try {
      await this.batchesService.consumeFefo(tx, consumableItemId, labStock.id, quantity);
    } catch {
      batchesOk = false;
    }
    if (!batchesOk) return;

    const stockResult = await tx.stockBalance.updateMany({
      where: { itemId: consumableItemId, locationId: labStock.id, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (stockResult.count === 0) return;

    await tx.stockMovement.create({
      data: {
        itemId: consumableItemId,
        fromLocationId: labStock.id,
        quantity,
        movementType: "ISSUE",
        relatedLabOrderItemId: labOrderItemId,
        performedById,
      },
    });
  }

  // Entering a result and finalizing it are the same action - there is no
  // second approval step (docs/MODULES-SPEC.md).
  async enterResult(itemId: string, dto: EnterResultDto, actor: AuthenticatedUser) {
    const item = await this.labOrdersService.requireOrderItem(itemId);
    if (item.status !== "PROCESSING") {
      throw new ConflictException(`Cannot enter a result while the item is ${item.status} - it must be PROCESSING first`);
    }

    return this.prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.labOrderItem.updateMany({
        where: { id: itemId, status: "PROCESSING" },
        data: { status: "FINAL" },
      });
      if (statusUpdate.count === 0) {
        throw new ConflictException("This item's status changed since it was read");
      }

      const result = await tx.labResult.create({
        data: { labOrderItemId: itemId, value: dto.value, enteredById: actor.id, isFinal: true },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "LAB_RESULT_ENTERED",
          entityType: "LabResult",
          entityId: result.id,
          newValue: { labOrderItemId: itemId, value: dto.value },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: item.labOrder.patientId,
          type: "LAB_RESULT_FINAL",
          payload: { labOrderItemId: itemId, testCode: item.labTest.code, testName: item.labTest.name, value: dto.value },
          performedById: actor.id,
          sourceModule: "lab",
        },
      });

      // Manual judgment call only - see EnterResultDto for why this is
      // never automatic (docs/PROJECT-PHASES-PLAN.md Phase 9 acceptance
      // criterion 6: "لو مفعَّلة").
      if (dto.flagCritical) {
        const alert = await tx.clinicalAlert.create({
          data: {
            patientId: item.labOrder.patientId,
            severity: "CRITICAL",
            category: `Lab: ${item.labTest.name}`,
            message: dto.alertMessage ?? `Critical result for ${item.labTest.name}: ${dto.value}`,
            createdById: actor.id,
          },
        });
        await this.auditService.log(
          {
            actorId: actor.id,
            actorRole: actor.roles[0] ?? "UNKNOWN",
            action: "CLINICAL_ALERT_CREATED",
            entityType: "ClinicalAlert",
            entityId: alert.id,
            newValue: alert,
          },
          tx,
        );
      }

      return result;
    });
  }

  // Never mutates the current result - creates a new row pointing back at
  // it via amendedFromId, keeping the superseded value fully intact
  // (docs/MODULES-SPEC.md: "لا يستبدلها - ينشئ AMENDED جديدة").
  async amendResult(itemId: string, dto: AmendResultDto, actor: AuthenticatedUser) {
    const item = await this.labOrdersService.requireOrderItem(itemId);
    if (item.status !== "FINAL" && item.status !== "AMENDED") {
      throw new ConflictException(`Cannot amend a result while the item is ${item.status}`);
    }
    const current = await this.prisma.labResult.findFirst({
      where: { labOrderItemId: itemId },
      orderBy: { createdAt: "desc" },
    });
    if (!current) {
      throw new ConflictException("No existing result to amend");
    }

    return this.prisma.$transaction(async (tx) => {
      const amended = await tx.labResult.create({
        data: {
          labOrderItemId: itemId,
          value: dto.value,
          enteredById: actor.id,
          isFinal: true,
          amendedFromId: current.id,
          amendReason: dto.reason,
        },
      });

      await tx.labOrderItem.update({ where: { id: itemId }, data: { status: "AMENDED" } });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "LAB_RESULT_AMENDED",
          entityType: "LabResult",
          entityId: amended.id,
          oldValue: { value: current.value },
          newValue: { value: dto.value },
          reason: dto.reason,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: item.labOrder.patientId,
          type: "LAB_RESULT_AMENDED",
          payload: {
            labOrderItemId: itemId,
            testCode: item.labTest.code,
            oldValue: current.value,
            newValue: dto.value,
            reason: dto.reason,
          },
          performedById: actor.id,
          sourceModule: "lab",
        },
      });

      return amended;
    });
  }

  // Chronological, one value per order (the latest/amended one when it
  // exists) - what a trend chart needs (docs/PROJECT-PHASES-PLAN.md Phase 9
  // acceptance criterion 5).
  async trend(labTestId: string, patientId: string, limit: number) {
    const test = await this.prisma.labTest.findUnique({ where: { id: labTestId } });
    if (!test) {
      throw new NotFoundException("Lab test not found");
    }

    const items = await this.prisma.labOrderItem.findMany({
      where: { labTestId, status: { in: ["FINAL", "AMENDED"] }, labOrder: { patientId } },
      include: {
        results: { orderBy: { createdAt: "desc" }, take: 1 },
        labOrder: { select: { orderedAt: true, episodeCode: true } },
      },
      orderBy: { labOrder: { orderedAt: "desc" } },
      take: limit,
    });

    return items
      .filter((item) => item.results.length > 0)
      .map((item) => ({
        episodeCode: item.labOrder.episodeCode,
        date: item.labOrder.orderedAt,
        value: item.results[0].value,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
