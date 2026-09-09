import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { DashboardService } from "./dashboard.service";
import { LiveCenterQueryDto } from "./dto/live-center-query.dto";
import { DashboardDateQueryDto } from "./dto/dashboard-date-query.dto";

// One route per widget, each gated by the exact same permission that
// already guards that widget's underlying data elsewhere in the app - a
// limited-permission user (e.g. Reception) gets a plain 403 on any widget
// they can't see, rather than a 200 with that section quietly omitted
// (docs/PROJECT-PHASES-PLAN.md Phase 13 acceptance criterion 5).
@Controller("dashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("live-center")
  @RequireAnyPermission("scheduling.manage", "attendance.checkin", "dialysis.session.view")
  liveCenter(@Query() query: LiveCenterQueryDto) {
    return this.dashboardService.getLiveCenter(query.date, query.shiftId);
  }

  @Get("machines")
  @RequirePermissions("machine.view")
  machines() {
    return this.dashboardService.getMachinesSummary();
  }

  @Get("wards")
  @RequirePermissions("nursing.ward.view")
  wards() {
    return this.dashboardService.getWardsSummary();
  }

  @Get("inventory-alerts")
  @RequirePermissions("inventory.view")
  inventoryAlerts() {
    return this.dashboardService.getInventoryAlertsSummary();
  }

  @Get("pending-work")
  @RequireAnyPermission("lab.queue.view", "pharmacy.dispense")
  pendingWork(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboardService.getPendingWork(actor);
  }

  @Get("session-cost")
  @RequirePermissions("inventory.view")
  sessionCost(@Query() query: DashboardDateQueryDto) {
    return this.dashboardService.getSessionCostSummary(query.date);
  }
}
