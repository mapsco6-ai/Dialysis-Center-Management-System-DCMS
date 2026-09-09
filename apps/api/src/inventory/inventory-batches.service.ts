import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateInventoryBatchDto } from "./dto/create-inventory-batch.dto";

export interface ConsumedBatch {
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}

@Injectable()
export class InventoryBatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async requireItem(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException("Inventory item not found");
    }
    return item;
  }

  // Receiving a fresh batch is a real stock-in event - InventoryBatch is a
  // sub-ledger of StockBalance broken out by lot/expiry (docs/MODULES-SPEC.md
  // Phase 11), not a separate pool of stock, so both move together in one
  // transaction exactly like every other stock-in in this codebase.
  async receive(itemId: string, dto: CreateInventoryBatchDto, actor: AuthenticatedUser) {
    const item = await this.requireItem(itemId);
    if (!item.requiresBatchTracking) {
      throw new BadRequestException("This item does not require batch tracking - use stock adjustment instead");
    }
    const location = await this.prisma.stockLocation.findUnique({ where: { id: dto.locationId } });
    if (!location) {
      throw new BadRequestException("locationId not found");
    }
    const expiryDate = new Date(dto.expiryDate);

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.upsert({
        where: {
          itemId_locationId_batchNumber: { itemId, locationId: dto.locationId, batchNumber: dto.batchNumber },
        },
        create: {
          itemId,
          locationId: dto.locationId,
          batchNumber: dto.batchNumber,
          quantity: dto.quantity,
          expiryDate,
          receivedById: actor.id,
        },
        // Re-receiving more of the same physical batch number adds to it -
        // its expiry date never changes on a quantity top-up.
        update: { quantity: { increment: dto.quantity } },
      });

      await tx.stockBalance.upsert({
        where: { itemId_locationId: { itemId, locationId: dto.locationId } },
        create: { itemId, locationId: dto.locationId, quantity: dto.quantity },
        update: { quantity: { increment: dto.quantity } },
      });

      await tx.stockMovement.create({
        data: {
          itemId,
          toLocationId: dto.locationId,
          quantity: dto.quantity,
          movementType: "ADJUSTMENT",
          reason: `Batch receipt ${dto.batchNumber}`,
          performedById: actor.id,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "INVENTORY_BATCH_RECEIVED",
          entityType: "InventoryBatch",
          entityId: batch.id,
          newValue: {
            itemId,
            locationId: dto.locationId,
            batchNumber: dto.batchNumber,
            quantity: dto.quantity,
            expiryDate,
          },
        },
        tx,
      );

      return batch;
    });
  }

  async listForItem(itemId: string, locationId?: string) {
    await this.requireItem(itemId);
    return this.prisma.inventoryBatch.findMany({
      where: { itemId, ...(locationId ? { locationId } : {}) },
      include: { location: true },
      orderBy: { expiryDate: "asc" },
    });
  }

  // Batches expiring within `withinDays` (Expiring Soon) or already past
  // their expiry (Expired) - docs/PROJECT-PHASES-PLAN.md Phase 11 acceptance
  // criterion 3. The spec doesn't name an exact window for "Expiring Soon";
  // 30 days is this implementation's documented default until the center
  // specifies otherwise.
  async listExpiryAlerts(withinDays = 30) {
    const now = new Date();
    const soonCutoff = new Date(now);
    soonCutoff.setDate(soonCutoff.getDate() + withinDays);

    const [expired, expiringSoon] = await Promise.all([
      this.prisma.inventoryBatch.findMany({
        where: { expiryDate: { lt: now }, quantity: { gt: 0 } },
        include: { item: true, location: true },
        orderBy: { expiryDate: "asc" },
      }),
      this.prisma.inventoryBatch.findMany({
        where: { expiryDate: { gte: now, lte: soonCutoff }, quantity: { gt: 0 } },
        include: { item: true, location: true },
        orderBy: { expiryDate: "asc" },
      }),
    ]);

    return { expired, expiringSoon, withinDays };
  }

  // FEFO (First-Expiry-First-Out) consumption: draws only from batches that
  // haven't expired yet (docs/MODULES-SPEC.md Phase 11: "Batch منتهي
  // الصلاحية لا يُقترح تلقائياً للصرف"), earliest expiry first. Returns null
  // for an item that isn't batch-tracked at all - callers fall back to a
  // plain StockBalance decrement in that case, unchanged from pre-Phase-11
  // behavior. Must run inside the same transaction as the caller's
  // StockBalance decrement so both ledgers move together atomically.
  async consumeFefo(
    tx: Prisma.TransactionClient,
    itemId: string,
    locationId: string,
    quantity: number,
  ): Promise<ConsumedBatch[] | null> {
    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    if (!item.requiresBatchTracking) {
      return null;
    }

    const now = new Date();
    const batches = await tx.inventoryBatch.findMany({
      where: { itemId, locationId, expiryDate: { gt: now }, quantity: { gt: 0 } },
      orderBy: { expiryDate: "asc" },
    });
    const available = batches.reduce((sum, b) => sum + Number(b.quantity), 0);
    if (available < quantity) {
      throw new ConflictException(
        `Not enough non-expired batch stock of ${item.name} at this location to fulfill ${quantity}`,
      );
    }

    let remaining = quantity;
    const consumed: ConsumedBatch[] = [];
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(batch.quantity));
      // Atomic and conditional on the batch still holding at least `take` -
      // same discipline as every other stock decrement in this codebase.
      const result = await tx.inventoryBatch.updateMany({
        where: { id: batch.id, quantity: { gte: take } },
        data: { quantity: { decrement: take } },
      });
      if (result.count === 0) {
        throw new ConflictException("Batch stock changed since it was read - please retry");
      }
      consumed.push({
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate.toISOString().slice(0, 10),
        quantity: take,
      });
      remaining -= take;
    }

    return consumed;
  }

  // The other side of consumeFefo - recreates the exact batch/expiry drawn
  // from at the source, at the destination, so a transfer never loses batch
  // traceability (docs review Phase 11 acceptance criterion 1 and 3).
  async restoreBatches(
    tx: Prisma.TransactionClient,
    itemId: string,
    locationId: string,
    batches: ConsumedBatch[],
    receivedById: string,
  ) {
    for (const b of batches) {
      await tx.inventoryBatch.upsert({
        where: { itemId_locationId_batchNumber: { itemId, locationId, batchNumber: b.batchNumber } },
        create: {
          itemId,
          locationId,
          batchNumber: b.batchNumber,
          quantity: b.quantity,
          expiryDate: new Date(b.expiryDate),
          receivedById,
        },
        update: { quantity: { increment: b.quantity } },
      });
    }
  }
}
