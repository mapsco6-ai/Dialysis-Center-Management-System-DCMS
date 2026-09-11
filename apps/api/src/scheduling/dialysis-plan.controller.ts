import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SchedulingService } from "./scheduling.service";
import { SetDialysisPlanDto } from "./dto/set-dialysis-plan.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Scheduling - Dialysis Plan")
@ApiBearerAuth("bearer")
@Controller("patients/:patientId/dialysis-plan")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DialysisPlanController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Post()
  @RequirePermissions("scheduling.manage")
  setPlan(
    @Param("patientId") patientId: string,
    @Body() dto: SetDialysisPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.schedulingService.setDialysisPlan(patientId, dto, actor);
  }

  @Get()
  @RequirePermissions("scheduling.manage")
  getPlan(@Param("patientId") patientId: string) {
    return this.schedulingService.getDialysisPlan(patientId);
  }
}
