import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SessionsService } from "./sessions.service";
import { PreDialysisDto } from "./dto/pre-dialysis.dto";
import { StartDialysisDto } from "./dto/start-dialysis.dto";
import { EndDialysisDto } from "./dto/end-dialysis.dto";
import { ReassignMachineDto } from "./dto/reassign-machine.dto";
import { InterruptSessionDto } from "./dto/interrupt-session.dto";

@Controller("sessions/:id")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @RequirePermissions("dialysis.session.view")
  getOverview(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.getOverview(id, actor);
  }

  @Post("pre-dialysis")
  @RequirePermissions("dialysis.pre.record")
  preDialysis(@Param("id") id: string, @Body() dto: PreDialysisDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.preDialysis(id, dto, actor);
  }

  @Post("confirm-supplies-ready")
  @RequirePermissions("dialysis.pre.record")
  confirmSuppliesReady(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.confirmSuppliesReady(id, actor);
  }

  @Post("start")
  @RequirePermissions("dialysis.start")
  start(@Param("id") id: string, @Body() dto: StartDialysisDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.start(id, dto, actor);
  }

  @Post("end")
  @RequirePermissions("dialysis.end")
  end(@Param("id") id: string, @Body() dto: EndDialysisDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.end(id, dto, actor);
  }

  @Post("discharge")
  @RequirePermissions("dialysis.end")
  discharge(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.discharge(id, actor);
  }

  @Post("interrupt")
  @RequirePermissions("dialysis.end")
  interrupt(@Param("id") id: string, @Body() dto: InterruptSessionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.interrupt(id, dto.reason, actor);
  }

  @Post("resume")
  @RequirePermissions("dialysis.start")
  resume(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.resume(id, actor);
  }

  @Post("reassign-machine")
  @RequireAnyPermission("dialysis.start", "machine.assign")
  reassignMachine(
    @Param("id") id: string,
    @Body() dto: ReassignMachineDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sessionsService.reassignMachine(id, dto, actor);
  }
}
