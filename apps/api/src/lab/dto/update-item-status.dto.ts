import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

// Only the two manual staff transitions are reachable here - RESULT_ENTERED
// and FINAL are set together by entering a result (no second approval
// step, docs/MODULES-SPEC.md), and AMENDED/CANCELLED have their own
// dedicated paths.
const REACHABLE_STATUSES = ["SAMPLE_COLLECTED", "PROCESSING"] as const;
export type ReachableItemStatus = (typeof REACHABLE_STATUSES)[number];

export class UpdateItemStatusDto {
  @ApiProperty({ enum: REACHABLE_STATUSES })
  @IsIn(REACHABLE_STATUSES)
  status!: ReachableItemStatus;
}
