import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, ValidateIf } from "class-validator";

export class AssignMachineDto {
  // Omitted: run the automatic 4-stage algorithm. Provided: a manual
  // override of a specific machine, which requires `reason` (docs/
  // PROJECT-PHASES-PLAN.md acceptance criterion 5).
  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  machineId?: string;

  @ApiProperty({ type: String, required: false })
  @ValidateIf((o) => o.machineId !== undefined)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
