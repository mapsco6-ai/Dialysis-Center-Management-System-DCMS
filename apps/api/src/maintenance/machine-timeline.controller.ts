import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { MaintenanceService } from "./maintenance.service";
import { DowntimeQueryDto } from "./dto/downtime-query.dto";

@Controller("machines/:machineId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MachineTimelineController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get("timeline")
  @RequirePermissions("machine.view")
  timeline(@Param("machineId") machineId: string) {
    return this.maintenanceService.getMachineTimeline(machineId);
  }

  @Get("downtime")
  @RequirePermissions("machine.view")
  downtime(@Param("machineId") machineId: string, @Query() query: DowntimeQueryDto) {
    return this.maintenanceService.getDowntimeReport(machineId, query.from, query.to);
  }
}
