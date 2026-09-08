import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { MachinesService } from "./machines.service";
import { AssignMachineDto } from "./dto/assign-machine.dto";

@Controller("sessions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionMachineController {
  constructor(private readonly machinesService: MachinesService) {}

  @Post(":id/assign-machine")
  @RequirePermissions("machine.assign")
  assign(
    @Param("id") id: string,
    @Body() dto: AssignMachineDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.machinesService.assignMachine(id, dto, actor);
  }
}
