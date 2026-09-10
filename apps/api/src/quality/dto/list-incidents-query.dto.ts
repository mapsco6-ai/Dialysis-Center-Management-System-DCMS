import { IncidentSeverity, IncidentStatus, IncidentType } from "@prisma/client";
import { IsEnum, IsOptional, IsString, Matches } from "class-validator";
import { ExportQueryDto } from "../../reports/dto/export-query.dto";

// Every field here is a filter for the quality/incident report (docs/
// PROJECT-PHASES-PLAN.md Phase 15 acceptance criterion 2: "تصنيف الحادثة
// (نوع/شدة) قابل للفرز والتصفية") - IncidentsService.list applies them as
// an AND, and the client sorts/groups the flat response however it needs.
// Extends ExportQueryDto (Phase 14) so this same list endpoint can also
// return the same rows as PDF/Excel via the shared ReportExportService.
export class ListIncidentsQueryDto extends ExportQueryDto {
  @IsOptional()
  @IsEnum(IncidentType)
  type?: IncidentType;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  machineId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from must be in the form YYYY-MM-DD" })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "to must be in the form YYYY-MM-DD" })
  to?: string;
}
