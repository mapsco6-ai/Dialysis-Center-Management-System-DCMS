import { IncidentSeverity, IncidentType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

// Every field lines up with docs/MODULES-SPEC.md Phase 15's IncidentReport
// table verbatim. patientId/sessionId/machineId are each independently
// optional here (the service layer, not the DTO, enforces that at least one
// of patientId/machineId is present - see IncidentsService.create).
export class CreateIncidentDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  machineId?: string;

  @IsEnum(IncidentType)
  type!: IncidentType;

  @IsEnum(IncidentSeverity)
  severity!: IncidentSeverity;

  @IsString()
  @IsNotEmpty()
  description!: string;
}
