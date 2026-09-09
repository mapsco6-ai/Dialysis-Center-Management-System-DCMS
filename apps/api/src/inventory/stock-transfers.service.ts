import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, StockTransferStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { InventoryBatchesService, ConsumedBatch } from "./inventory-batches.service";
import { CreateStockTransferDto } from "./dto/create-stock-transfer.dto";
import { RejectStockTransferDto } from "./dto/reject-stock-transfer.dto";

const TRANSFER_INCLUDE = {
  item: true,
  fromLocation: true,
  toLocation: true,
  requestedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  issuedBy: { select: { id: true, fullName: true } },
  receivedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.StockTransferInclude;

// The full REQUESTED->APPROVED->ISSUED->RECEIVED handoff between any two
// StockLocations (docs/MODULES-SPEC.md Phase 11). Quantity moves only at
// ISSUED (debit fromLocation) and RECEIVED (credit toLocation) - never at
// REQUESTED/APPROVED - so the ledger always matches physical reality rather
// than an intent that might still be rejected or never followed through.
@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly batchesService: InventoryBatchesService,
  ) {}

  private async requireTransfer(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id } });
    if (!transfer) {
      throw new NotFoundException("Stock transfer not found");
    }
    return transfer;
  }

  async request(dto: CreateStockTransferDto, actor: AuthenticatedUser) {
    if (dto.fromLocationId === dto.toLocationId) {
      throw new BadRequestException("fromLocationId and toLocationId must be different");
    }
    const [item, fromLocation, toLocation] = await Promise.all([
      this.prisma.inventoryItem.findUnique({ where: { id: dto.itemId } }),
      this.prisma.stockLocation.findUnique({ where: { id: dto.fromLocationId } }),
      this.prisma.stockLocation.findUnique({ where: { id: dto.toLocationId } }),
    ]);
    if (!item) throw new BadRequestException("itemId not found");
    if (!fromLocation) throw new BadRequestException("fromLocationId not found");
    if (!toLocation) throw new BadRequestException("toLocationId not found");

    const transfer = await this.prisma.stockTransfer.create({
      data: {
        itemId: dto.itemId,
        fromLocationId: dto.fromLocationId,
        toLocationId: dto.toLocationId,
        quantity: dto.quantity,
        reason: dto.reason,
        requestedById: actor.id,
      },
      include: TRANSFER_INCLUDE,
    });

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "STOCK_TRANSFER_REQUESTED",
      entityType: "StockTransfer",
      entityId: transfer.id,
      newValue: { itemId: dto.itemId, fromLocationId: dto.fromLocationId, toLocationId: dto.toLocationId, quantity: dto.quantity },
      reason: dto.reason,
    });

    return transfer;
  }

  async approve(id: string, actor: AuthenticatedUser) {
    const transfer = await this.requireTransfer(id);
    if (transfer.status !== "REQUESTED") {
      throw new ConflictException(`Cannot approve a transfer that is ${transfer.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic and conditional on still being REQUESTED - closes the race
      // where two approvers act on the same request at once.
      const result = await tx.stockTransfer.updateMany({
        where: { id, status: "REQUESTED" },
        data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() },
      });
      if (result.count === 0) {
        throw new ConflictException("This transfer's status changed since it was read");
      }

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "STOCK_TRANSFER_APPROVED",
          entityType: "StockTransfer",
          entityId: id,
          oldValue: { status: "REQUESTED" },
          newValue: { status: "APPROVED" },
        },
        tx,
      );

      return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: TRANSFER_INCLUDE });
    });
  }

  // Either a still-pending request or an already-approved one can be
  // rejected - only ISSUED (stock has physically left) or already-decided
  // transfers cannot.
  async reject(id: string, dto: RejectStockTransferDto, actor: AuthenticatedUser) {
    const transfer = await this.requireTransfer(id);
    if (transfer.status !== "REQUESTED" && transfer.status !== "APPROVED") {
      throw new ConflictException(`Cannot reject a transfer that is ${transfer.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.stockTransfer.updateMany({
        where: { id, status: transfer.status },
        data: { status: "REJECTED", rejectionReason: dto.reason },
      });
      if (result.count === 0) {
        throw new ConflictException("This transfer's status changed since it was read");
      }

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "STOCK_TRANSFER_REJECTED",
          entityType: "StockTransfer",
          entityId: id,
          oldValue: { status: transfer.status },
          newValue: { status: "REJECTED" },
          reason: dto.reason,
        },
        tx,
      );

      return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: TRANSFER_INCLUDE });
    });
  }

  async issue(id: string, actor: AuthenticatedUser) {
    const transfer = await this.requireTransfer(id);
    if (transfer.status !== "APPROVED") {
      throw new ConflictException(`Cannot issue a transfer that is ${transfer.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // FEFO batch consumption (docs/MODULES-SPEC.md Phase 11) runs in the
      // same transaction as the balance decrement below, so a shortage in
      // either ledger rolls both back together. Returns null (no-op) for a
      // non-batch-tracked item.
      const issuedBatches = await this.batchesService.consumeFefo(
        tx,
        transfer.itemId,
        transfer.fromLocationId,
        Number(transfer.quantity),
      );

      const balanceResult = await tx.stockBalance.updateMany({
        where: { itemId: transfer.itemId, locationId: transfer.fromLocationId, quantity: { gte: transfer.quantity } },
        data: { quantity: { decrement: transfer.quantity } },
      });
      if (balanceResult.count === 0) {
        throw new ConflictException(`Not enough stock at the source location to issue ${transfer.quantity}`);
      }

      const result = await tx.stockTransfer.updateMany({
        where: { id, status: "APPROVED" },
        data: {
          status: "ISSUED",
          issuedById: actor.id,
          issuedAt: new Date(),
          issuedBatches: (issuedBatches ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      if (result.count === 0) {
        throw new ConflictException("This transfer's status changed since it was read");
      }

      await tx.stockMovement.create({
        data: {
          itemId: transfer.itemId,
          fromLocationId: transfer.fromLocationId,
          quantity: transfer.quantity,
          movementType: "TRANSFER",
          relatedTransferId: id,
          performedById: actor.id,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "STOCK_TRANSFER_ISSUED",
          entityType: "StockTransfer",
          entityId: id,
          oldValue: { status: "APPROVED" },
          newValue: { status: "ISSUED", issuedBatches },
        },
        tx,
      );

      return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: TRANSFER_INCLUDE });
    });
  }

  async receive(id: string, actor: AuthenticatedUser) {
    const transfer = await this.requireTransfer(id);
    if (transfer.status !== "ISSUED") {
      throw new ConflictException(`Cannot receive a transfer that is ${transfer.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.stockTransfer.updateMany({
        where: { id, status: "ISSUED" },
        data: { status: "RECEIVED", receivedById: actor.id, receivedAt: new Date() },
      });
      if (result.count === 0) {
        throw new ConflictException("This transfer's status changed since it was read");
      }

      await tx.stockBalance.upsert({
        where: { itemId_locationId: { itemId: transfer.itemId, locationId: transfer.toLocationId } },
        create: { itemId: transfer.itemId, locationId: transfer.toLocationId, quantity: transfer.quantity },
        update: { quantity: { increment: transfer.quantity } },
      });

      const issuedBatches = transfer.issuedBatches as ConsumedBatch[] | null;
      if (issuedBatches) {
        await this.batchesService.restoreBatches(tx, transfer.itemId, transfer.toLocationId, issuedBatches, actor.id);
      }

      await tx.stockMovement.create({
        data: {
          itemId: transfer.itemId,
          toLocationId: transfer.toLocationId,
          quantity: transfer.quantity,
          movementType: "TRANSFER",
          relatedTransferId: id,
          performedById: actor.id,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "STOCK_TRANSFER_RECEIVED",
          entityType: "StockTransfer",
          entityId: id,
          oldValue: { status: "ISSUED" },
          newValue: { status: "RECEIVED" },
        },
        tx,
      );

      return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: TRANSFER_INCLUDE });
    });
  }

  async listAll(status?: StockTransferStatus) {
    return this.prisma.stockTransfer.findMany({
      where: status ? { status } : undefined,
      include: TRANSFER_INCLUDE,
      orderBy: { requestedAt: "desc" },
    });
  }
}
