import { IsInt, IsOptional, Min } from "class-validator";

export class UpdateShiftCapacityDto {
  @IsInt()
  @Min(0)
  nominalCapacity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reservedCapacity?: number;

  // Phase 3 (Reception): minutes after dialysisStart before a check-in
  // counts as LATE instead of ARRIVED.
  @IsOptional()
  @IsInt()
  @Min(0)
  lateThresholdMinutes?: number;
}
