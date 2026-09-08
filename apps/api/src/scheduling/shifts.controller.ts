import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ShiftsService } from "./shifts.service";
import { UpdateShiftCapacityDto } from "./dto/update-shift-capacity.dto";

@Controller("shifts")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  @RequirePermissions("scheduling.manage")
  findAll() {
    return this.shiftsService.findAll();
  }

  @Patch(":id/capacity")
  @RequirePermissions("shift.manage")
  updateCapacity(
    @Param("id") id: string,
    @Body() dto: UpdateShiftCapacityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shiftsService.updateCapacity(id, dto, actor);
  }
}
