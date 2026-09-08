import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, ValidateIf } from "class-validator";

export class AssignMachineDto {
  // Omitted: run the automatic 4-stage algorithm. Provided: a manual
  // override of a specific machine, which requires `reason` (docs/
  // PROJECT-PHASES-PLAN.md acceptance criterion 5).
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  machineId?: string;

  @ValidateIf((o) => o.machineId !== undefined)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
