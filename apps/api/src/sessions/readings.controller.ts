import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SessionsService } from "./sessions.service";
import { CreateReadingDto } from "./dto/create-reading.dto";
import { AmendReadingDto } from "./dto/amend-reading.dto";

@Controller("sessions/:id/readings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReadingsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @RequirePermissions("dialysis.session.view")
  list(@Param("id") id: string) {
    return this.sessionsService.listReadings(id);
  }

  @Post()
  @RequirePermissions("dialysis.reading.create")
  create(@Param("id") id: string, @Body() dto: CreateReadingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.addReading(id, dto, actor);
  }

  @Post(":readingId/amend")
  @RequirePermissions("dialysis.reading.create")
  amend(
    @Param("id") id: string,
    @Param("readingId") readingId: string,
    @Body() dto: AmendReadingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sessionsService.amendReading(id, readingId, dto, actor);
  }
}
