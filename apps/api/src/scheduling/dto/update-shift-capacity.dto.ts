import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, Min } from "class-validator";

export class UpdateShiftCapacityDto {
  @ApiProperty({ type: "integer", minimum: 0 })
  @IsInt()
  @Min(0)
  nominalCapacity!: number;

  @ApiProperty({ type: "integer", required: false, nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  reservedCapacity?: number;

  // Phase 3 (Reception): minutes after dialysisStart before a check-in
  // counts as LATE instead of ARRIVED.
  @ApiProperty({ type: "integer", required: false, nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  lateThresholdMinutes?: number;
}
