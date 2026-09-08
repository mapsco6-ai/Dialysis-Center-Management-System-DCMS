import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateInventoryItemDto } from "./dto/create-inventory-item.dto";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { isUniqueConstraintOn } from "../patients/prisma-errors.util";

@Injectable()
export class InventoryItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async requireMainWarehouse() {
    return this.prisma.stockLocation.findUniqueOrThrow({ where: { type: "MAIN_WAREHOUSE" } });
  }

  async create(dto: CreateInventoryItemDto, actor: AuthenticatedUser) {
    const warehouse = await this.requireMainWarehouse();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            name: dto.name,
            category: dto.category,
            unit: dto.unit,
            barcode: dto.barcode,
            minimumStock: dto.minimumStock ?? 0,
            cost: dto.cost ?? 0,
            requiresBatchTracking: dto.requiresBatchTracking ?? false,
          },
        });

        // Every item always has a MAIN_WAREHOUSE balance row (even if zero) so
        // stock deduction can rely on a conditional UPDATE always finding a
        // row to match against, instead of having to branch on "row exists?".
        await tx.stockBalance.create({
          data: { itemId: item.id, locationId: warehouse.id, quantity: 0 },
        });

        await this.auditService.log(
          {
            actorId: actor.id,
            actorRole: actor.roles[0] ?? "UNKNOWN",
            action: "INVENTORY_ITEM_CREATED",
            entityType: "InventoryItem",
            entityId: item.id,
            newValue: item,
          },
          tx,
        );

        return item;
      });
    } catch (error) {
      if (isUniqueConstraintOn(error, "barcode")) {
        throw new ConflictException("An item with this barcode already exists");
      }
      throw error;
    }
  }

  async findAll() {
    const warehouse = await this.requireMainWarehouse();
    const items = await this.prisma.inventoryItem.findMany({
      orderBy: { name: "asc" },
      include: { balances: { where: { locationId: warehouse.id } } },
    });
    return items.map((item) => ({
      ...item,
      balances: undefined,
      quantityInStock: item.balances[0]?.quantity ?? 0,
    }));
  }

  async findOne(id: string) {
    const warehouse = await this.requireMainWarehouse();
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { balances: { where: { locationId: warehouse.id } } },
    });
    if (!item) {
      throw new NotFoundException("Inventory item not found");
    }
    return { ...item, balances: undefined, quantityInStock: item.balances[0]?.quantity ?? 0 };
  }

  private async requireItem(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException("Inventory item not found");
    }
    return item;
  }

  // Manual stock-in/correction until Phase 11 adds a real goods-receipt /
  // transfer workflow. Always conditional on the resulting balance staying
  // >= 0 - same atomic-update discipline as the Phase 3 check-in fix, so two
  // concurrent decreases can't both succeed past zero.
  async adjustStock(itemId: string, dto: AdjustStockDto, actor: AuthenticatedUser) {
    await this.requireItem(itemId);
    const warehouse = await this.requireMainWarehouse();
    const signedQuantity = dto.direction === "INCREASE" ? dto.quantity : -dto.quantity;

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.stockBalance.findUniqueOrThrow({
        where: { itemId_locationId: { itemId, locationId: warehouse.id } },
      });

      if (dto.direction === "DECREASE") {
        const result = await tx.stockBalance.updateMany({
          where: {
            itemId,
            locationId: warehouse.id,
            quantity: { gte: dto.quantity },
          },
          data: { quantity: { decrement: dto.quantity } },
        });
        if (result.count === 0) {
          throw new BadRequestException(
            `Cannot decrease stock by ${dto.quantity} - only ${before.quantity} available`,
          );
        }
      } else {
        await tx.stockBalance.update({
          where: { itemId_locationId: { itemId, locationId: warehouse.id } },
          data: { quantity: { increment: dto.quantity } },
        });
      }

      const movement = await tx.stockMovement.create({
        data: {
          itemId,
          toLocationId: dto.direction === "INCREASE" ? warehouse.id : undefined,
          fromLocationId: dto.direction === "DECREASE" ? warehouse.id : undefined,
          quantity: dto.quantity,
          movementType: "ADJUSTMENT",
          reason: dto.reason,
          performedById: actor.id,
        },
      });

      const after = await tx.stockBalance.findUniqueOrThrow({
        where: { itemId_locationId: { itemId, locationId: warehouse.id } },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "STOCK_ADJUSTED",
          entityType: "InventoryItem",
          entityId: itemId,
          oldValue: { quantity: before.quantity },
          newValue: { quantity: after.quantity, direction: dto.direction, delta: dto.quantity },
          reason: dto.reason,
        },
        tx,
      );

      return { balance: after, movement };
    });
  }
}
