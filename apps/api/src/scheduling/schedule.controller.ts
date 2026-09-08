import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { SchedulingService } from "./scheduling.service";

@Controller("schedule")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ScheduleController {
  constructor(private readonly schedulingService: SchedulingService) {}

  // Must be declared before the query-based route so "/schedule/today" isn't
  // swallowed by anything else - there's no conflicting ':param' route here,
  // but keeping the explicit path first mirrors the pattern used elsewhere.
  @Get("today")
  @RequirePermissions("scheduling.manage")
  getToday() {
    return this.schedulingService.getScheduleForToday();
  }

  @Get()
  @RequirePermissions("scheduling.manage")
  getByDate(@Query("date") date?: string) {
    if (!date) {
      throw new BadRequestException("Query parameter 'date' is required (YYYY-MM-DD)");
    }
    return this.schedulingService.getScheduleForDate(date);
  }
}
