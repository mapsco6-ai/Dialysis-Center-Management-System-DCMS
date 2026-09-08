import { Body, Controller, Delete, Get, Param, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PatientSupplyProfileService } from "./patient-supply-profile.service";
import { SetSupplyProfileDto } from "./dto/set-supply-profile.dto";

@Controller("patients/:patientId/supply-profile")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PatientSupplyProfileController {
  constructor(private readonly service: PatientSupplyProfileService) {}

  @Get()
  @RequirePermissions("inventory.view")
  findAll(@Param("patientId") patientId: string) {
    return this.service.findAll(patientId);
  }

  @Put()
  @RequirePermissions("inventory.manage")
  setProfile(
    @Param("patientId") patientId: string,
    @Body() dto: SetSupplyProfileDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.setProfile(patientId, dto, actor);
  }

  @Delete(":itemId")
  @RequirePermissions("inventory.manage")
  removeItem(
    @Param("patientId") patientId: string,
    @Param("itemId") itemId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.removeItem(patientId, itemId, actor);
  }
}
