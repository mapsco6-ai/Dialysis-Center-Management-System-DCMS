import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { PatientsService } from "../patients/patients.service";
import { SchedulingService } from "./scheduling.service";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

// The reception scan workflow (docs/PROJECT-PHASES-PLAN.md Phase 3): one
// barcode scan returns everything the front-desk screen needs in one call -
// patient identity plus their schedule entry (if any) for today.
@ApiTags("Scheduling - Reception")
@ApiBearerAuth("bearer")
@Controller("reception")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReceptionController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly schedulingService: SchedulingService,
  ) {}

  @Get("scan/:barcode")
  @RequirePermissions("attendance.checkin")
  async scan(@Param("barcode") barcode: string) {
    const patient = await this.patientsService.findByBarcode(barcode);
    const todaySchedules = await this.schedulingService.findTodayForPatient(patient.id);
    return { patient, todaySchedules };
  }
}
