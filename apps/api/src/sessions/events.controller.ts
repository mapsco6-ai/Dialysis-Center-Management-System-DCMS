import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SessionsService } from "./sessions.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Dialysis Sessions - Events")
@ApiBearerAuth("bearer")
@Controller("sessions/:id/events")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EventsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @RequirePermissions("dialysis.session.view")
  list(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.listEvents(id, actor);
  }

  @Post()
  @RequirePermissions("dialysis.event.create")
  create(@Param("id") id: string, @Body() dto: CreateEventDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.addEvent(id, dto, actor);
  }
}
