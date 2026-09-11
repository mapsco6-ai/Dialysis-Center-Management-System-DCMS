import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { WardDashboardService } from "./ward-dashboard.service";
import { WardDashboardQueryDto } from "./dto/ward-dashboard-query.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Nursing - Ward Dashboard")
@ApiBearerAuth("bearer")
@Controller("wards/:id/dashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WardDashboardController {
  constructor(private readonly wardDashboardService: WardDashboardService) {}

  @Get()
  @RequirePermissions("nursing.ward.view")
  get(@Param("id") id: string, @Query() query: WardDashboardQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.wardDashboardService.getDashboard(id, query.date, query.shiftId, actor);
  }
}
