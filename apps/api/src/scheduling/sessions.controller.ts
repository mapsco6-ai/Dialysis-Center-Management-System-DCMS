import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SchedulingService } from "./scheduling.service";
import { CreateExtraSessionDto } from "./dto/create-extra-session.dto";
import { CreateEmergencySessionDto } from "./dto/create-emergency-session.dto";

@Controller("sessions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionsController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Post("extra")
  @RequirePermissions("scheduling.manage")
  createExtra(@Body() dto: CreateExtraSessionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.schedulingService.createExtraSession(dto, actor);
  }

  @Post("emergency")
  @RequirePermissions("dialysis.emergency.create")
  createEmergency(@Body() dto: CreateEmergencySessionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.schedulingService.createEmergencySession(dto, actor);
  }
}
