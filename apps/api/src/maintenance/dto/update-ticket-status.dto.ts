import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

// ASSIGNED has its own dedicated endpoint/DTO (POST .../assign) since it
// always carries a real assignedToId, not just a status flip. CLOSED also
// has its own endpoint because it carries a different real side effect -
// returning the machine to service (docs/MODULES-SPEC.md Phase 12: "CLOSED
// هو الوحيد المسموح أن يعيد الجهاز"). OPEN is excluded because it's the
// ticket's own creation state, never a target to transition back to.
const TICKET_UPDATABLE_STATUSES = ["IN_PROGRESS", "WAITING_PART", "COMPLETED"] as const;
export type TicketUpdatableStatus = (typeof TICKET_UPDATABLE_STATUSES)[number];

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TICKET_UPDATABLE_STATUSES })
  @IsIn(TICKET_UPDATABLE_STATUSES)
  status!: TicketUpdatableStatus;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;
}
