import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { SchedulingService } from "./scheduling.service";
import { GetScheduleQueryDto } from "./dto/get-schedule-query.dto";

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

  // GetScheduleQueryDto is validated by the global ValidationPipe before this
  // body ever runs - an invalid date/status now gets a clean 400 instead of
  // a 500 from Prisma, and (more importantly) instead of quietly triggering
  // getScheduleForDate's side-effect writes (schedule generation, absence
  // marking) on garbage input (docs review DCMS-041).
  @Get()
  @RequireAnyPermission(...VIEW_PERMISSIONS)
  getByDate(@Query() query: GetScheduleQueryDto) {
    return this.schedulingService.getScheduleForDate(query.date, query.status);
  }
}
