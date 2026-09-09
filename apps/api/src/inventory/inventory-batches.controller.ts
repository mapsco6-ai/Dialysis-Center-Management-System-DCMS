import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { InventoryBatchesService } from "./inventory-batches.service";
import { CreateInventoryBatchDto } from "./dto/create-inventory-batch.dto";

@Controller("inventory/items/:itemId/batches")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryBatchesController {
  constructor(private readonly batchesService: InventoryBatchesService) {}

  @Post()
  @RequirePermissions("inventory.batch.manage")
  receive(
    @Param("itemId") itemId: string,
    @Body() dto: CreateInventoryBatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.batchesService.receive(itemId, dto, actor);
  }

  @Get()
  @RequirePermissions("inventory.view")
  list(@Param("itemId") itemId: string, @Query("locationId") locationId?: string) {
    return this.batchesService.listForItem(itemId, locationId);
  }
}
