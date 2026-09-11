import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

// OPEN is excluded because it's the incident's own creation state, never a
// transition target (docs/PROJECT-PHASES-PLAN.md Phase 15: "المراجعة/
// الإغلاق لـMEDICAL_DIRECTOR" - both remaining states are that role's call).
const INCIDENT_UPDATABLE_STATUSES = ["UNDER_REVIEW", "CLOSED"] as const;
export type IncidentUpdatableStatus = (typeof INCIDENT_UPDATABLE_STATUSES)[number];

export class UpdateIncidentStatusDto {
  @ApiProperty({ enum: INCIDENT_UPDATABLE_STATUSES })
  @IsIn(INCIDENT_UPDATABLE_STATUSES)
  status!: IncidentUpdatableStatus;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;
}
