import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ScheduleStatus } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { SchedulingService } from "./scheduling.service";

// Viewable by full scheduling managers AND reception staff (who only hold
// attendance.checkin) - it's the same status board both need to see.
const VIEW_PERMISSIONS = ["scheduling.manage", "attendance.checkin"];

@Controller("schedule")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ScheduleController {
  constructor(private readonly schedulingService: SchedulingService) {}

  // Must be declared before the query-based route so "/schedule/today" isn't
  // swallowed by anything else - there's no conflicting ':param' route here,
  // but keeping the explicit path first mirrors the pattern used elsewhere.
  @Get("today")
  @RequireAnyPermission(...VIEW_PERMISSIONS)
  getToday() {
    return this.schedulingService.getScheduleForToday();
  }

  @Get()
  @RequireAnyPermission(...VIEW_PERMISSIONS)
  getByDate(@Query("date") date?: string, @Query("status") status?: ScheduleStatus) {
    if (!date) {
      throw new BadRequestException("Query parameter 'date' is required (YYYY-MM-DD)");
    }
    return this.schedulingService.getScheduleForDate(date, status);
  }
}
