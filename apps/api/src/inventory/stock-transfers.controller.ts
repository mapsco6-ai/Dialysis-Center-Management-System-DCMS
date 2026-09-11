import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { StockTransfersService } from "./stock-transfers.service";
import { CreateStockTransferDto } from "./dto/create-stock-transfer.dto";
import { RejectStockTransferDto } from "./dto/reject-stock-transfer.dto";
import { ListStockTransfersQueryDto } from "./dto/list-stock-transfers-query.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Inventory - Stock Transfers")
@ApiBearerAuth("bearer")
@Controller("inventory/transfers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockTransfersController {
  constructor(private readonly transfersService: StockTransfersService) {}

  @Post()
  @RequirePermissions("inventory.transfer.request")
  request(@Body() dto: CreateStockTransferDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.transfersService.request(dto, actor);
  }

  @Get()
  @RequireAnyPermission("inventory.view", "inventory.transfer.request", "inventory.transfer.approve", "inventory.transfer.issue", "inventory.transfer.receive")
  list(@Query() query: ListStockTransfersQueryDto) {
    return this.transfersService.listAll(query.status);
  }

  @Post(":id/approve")
  @RequirePermissions("inventory.transfer.approve")
  approve(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.transfersService.approve(id, actor);
  }

  @Post(":id/reject")
  @RequirePermissions("inventory.transfer.approve")
  reject(@Param("id") id: string, @Body() dto: RejectStockTransferDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.transfersService.reject(id, dto, actor);
  }

  @Post(":id/issue")
  @RequirePermissions("inventory.transfer.issue")
  issue(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.transfersService.issue(id, actor);
  }

  @Post(":id/receive")
  @RequirePermissions("inventory.transfer.receive")
  receive(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.transfersService.receive(id, actor);
  }
}
