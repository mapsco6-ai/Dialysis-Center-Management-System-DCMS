import { IsInt, IsOptional, Min } from "class-validator";

export class UpdateShiftCapacityDto {
  @IsInt()
  @Min(0)
  nominalCapacity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reservedCapacity?: number;
}
