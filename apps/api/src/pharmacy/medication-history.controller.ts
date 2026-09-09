import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { PharmacyService } from "./pharmacy.service";

@Controller("patients/:patientId/medication-history")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MedicationHistoryController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Get()
  @RequirePermissions("patient.view")
  get(@Param("patientId") patientId: string) {
    return this.pharmacyService.medicationHistory(patientId);
  }
}
