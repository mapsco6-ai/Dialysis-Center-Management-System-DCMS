import { ApiProperty } from "@nestjs/swagger";
import { IncidentSeverity, IncidentType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

// Every field lines up with docs/MODULES-SPEC.md Phase 15's IncidentReport
// table verbatim. patientId/sessionId/machineId are each independently
// optional here (the service layer, not the DTO, enforces that at least one
// of patientId/machineId is present - see IncidentsService.create).
export class CreateIncidentDto {
  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  machineId?: string;

  @ApiProperty({ enum: IncidentType })
  @IsEnum(IncidentType)
  type!: IncidentType;

  @ApiProperty({ enum: IncidentSeverity })
  @IsEnum(IncidentSeverity)
  severity!: IncidentSeverity;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  description!: string;
}
