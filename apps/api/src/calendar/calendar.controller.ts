import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CalendarService } from "./calendar.service";
import { GetCalendarQueryDto } from "./dto/get-calendar-query.dto";

@ApiTags("Calendar")
@ApiBearerAuth("bearer")
@Controller("me/calendar")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  // Every authenticated user has their own calendar - no permission gate,
  // same as /me/tasks and /nursing/my-assignments.
  @Get()
  get(@Query() query: GetCalendarQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.calendarService.getMyCalendar(user, query.from, query.to);
  }
}
