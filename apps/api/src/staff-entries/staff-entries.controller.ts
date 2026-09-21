import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { StaffEntriesService } from "./staff-entries.service";
import { CreateStaffEntryDto } from "./dto/create-staff-entry.dto";
import { ListStaffEntriesQueryDto } from "./dto/list-staff-entries-query.dto";
import { AssignStaffEntryDto, EscalateStaffEntryDto, UpdateStaffEntryStatusDto } from "./dto/review-staff-entry.dto";

@ApiTags("Staff entries")
@ApiBearerAuth("bearer")
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffEntriesController {
  constructor(private readonly service: StaffEntriesService) {}

  @Post("staff-entries")
  @RequirePermissions("entry.create")
  create(@Body() dto: CreateStaffEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  // Own entries: no permission beyond being logged in.
  @Get("staff-entries/mine")
  listMine(@Query() query: ListStaffEntriesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listMine(user, query);
  }

  @Get("staff-entries")
  @RequirePermissions("entry.review")
  list(@Query() query: ListStaffEntriesQueryDto) {
    return this.service.list(query);
  }

  @Get("staff-entries/:id")
  findOne(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @Patch("staff-entries/:id/status")
  @RequirePermissions("entry.review")
  updateStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateStaffEntryStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateStatus(id, dto, user);
  }

  @Patch("staff-entries/:id/assign")
  @RequirePermissions("entry.review")
  assign(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignStaffEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.assign(id, dto.assignedToId, user);
  }

  @Post("staff-entries/:id/escalate")
  @RequirePermissions("entry.review", "incident.report")
  escalate(@Param("id", ParseUUIDPipe) id: string, @Body() dto: EscalateStaffEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.escalate(id, dto.incidentType, user);
  }

  @Get("me/shift-summary")
  shiftSummary(@Query("date") date: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.service.shiftSummary(user, date);
  }
}
