import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ClinicalNotesService } from "./clinical-notes.service";
import { CreateClinicalNoteDto } from "./dto/create-clinical-note.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Doctor - Clinical Notes")
@ApiBearerAuth("bearer")
@Controller("patients/:patientId/clinical-notes")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalNotesController {
  constructor(private readonly clinicalNotesService: ClinicalNotesService) {}

  @Get()
  @RequirePermissions("patient.view")
  listForPatient(@Param("patientId") patientId: string) {
    return this.clinicalNotesService.listForPatient(patientId);
  }

  @Post()
  @RequirePermissions("prescription.create")
  create(
    @Param("patientId") patientId: string,
    @Body() dto: CreateClinicalNoteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clinicalNotesService.create(patientId, dto, actor);
  }
}
