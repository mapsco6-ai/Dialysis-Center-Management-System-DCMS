import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { InventoryItemsService } from "./inventory-items.service";
import { CreateInventoryItemDto } from "./dto/create-inventory-item.dto";
import { AdjustStockDto } from "./dto/adjust-stock.dto";

@Controller("inventory/items")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryItemsController {
  constructor(private readonly inventoryItemsService: InventoryItemsService) {}

  @Post()
  @RequirePermissions("inventory.manage")
  create(@Body() dto: CreateInventoryItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.inventoryItemsService.create(dto, actor);
  }

  @Get()
  @RequirePermissions("inventory.view")
  findAll() {
    return this.inventoryItemsService.findAll();
  }

  @Get(":id")
  @RequirePermissions("inventory.view")
  findOne(@Param("id") id: string) {
    return this.inventoryItemsService.findOne(id);
  }

  @Post(":id/stock/adjust")
  @RequirePermissions("inventory.manage")
  adjustStock(
    @Param("id") id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryItemsService.adjustStock(id, dto, actor);
  }
}
