import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrescriptionsService } from "./prescriptions.service";
import { AdministerMedicationDto } from "./dto/administer-medication.dto";

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get("patients/:patientId/prescriptions")
  @RequirePermissions("patient.view")
  listForPatient(@Param("patientId") patientId: string) {
    return this.prescriptionsService.listForPatient(patientId);
  }

  @Post("prescriptions/:id/administrations")
  @RequirePermissions("medication.administer")
  administer(
    @Param("id") id: string,
    @Body() dto: AdministerMedicationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.prescriptionsService.administer(id, dto, actor);
  }

  @Get("prescriptions/:id/administrations")
  @RequirePermissions("patient.view")
  listAdministrations(@Param("id") id: string) {
    return this.prescriptionsService.listAdministrations(id);
  }
}
