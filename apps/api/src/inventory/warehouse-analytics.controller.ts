import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { WarehouseAnalyticsService } from "./warehouse-analytics.service";
import { InventoryItemsService } from "./inventory-items.service";
import { ExpiryAlertsQueryDto } from "./dto/expiry-alerts-query.dto";
import { DaysRemainingQueryDto } from "./dto/days-remaining-query.dto";
import { ConsumptionReportQueryDto } from "./dto/consumption-report-query.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Inventory - Warehouse Analytics")
@ApiBearerAuth("bearer")
@Controller("inventory")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WarehouseAnalyticsController {
  constructor(
    private readonly analyticsService: WarehouseAnalyticsService,
    private readonly inventoryItemsService: InventoryItemsService,
  ) {}

  @Get("locations")
  @RequirePermissions("inventory.view")
  locations() {
    return this.inventoryItemsService.listLocations();
  }

  @Get("alerts/low-stock")
  @RequirePermissions("inventory.view")
  lowStock() {
    return this.analyticsService.getLowStockAlerts();
  }

  @Get("alerts/expiring")
  @RequirePermissions("inventory.view")
  expiring(@Query() query: ExpiryAlertsQueryDto) {
    return this.analyticsService.getExpiryAlerts(query.withinDays);
  }

  @Get("items/:id/days-remaining")
  @RequirePermissions("inventory.view")
  daysRemaining(@Param("id") id: string, @Query() query: DaysRemainingQueryDto) {
    return this.analyticsService.getDaysOfStockRemaining(id, query.lookbackDays);
  }

  @Get("schedules/:scheduleId/cost")
  @RequirePermissions("inventory.view")
  sessionCost(@Param("scheduleId") scheduleId: string) {
    return this.analyticsService.getSessionCost(scheduleId);
  }

  @Get("patients/:patientId/consumption-report")
  @RequirePermissions("inventory.view")
  consumptionReport(@Param("patientId") patientId: string, @Query() query: ConsumptionReportQueryDto) {
    return this.analyticsService.getPatientConsumptionReport(patientId, query.month);
  }
}
