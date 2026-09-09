import { MaintenanceSeverity } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

// Submitted as multipart/form-data alongside an optional `attachment` file
// (docs/PROJECT-PHASES-PLAN.md: "صورة اختيارية عبر MinIO") - these fields
// arrive as plain strings either way, which is why severity is validated as
// an enum rather than trusted as already-typed.
export class ReportFaultDto {
  @IsString()
  @IsNotEmpty()
  machineId!: string;

  @IsString()
  @IsNotEmpty()
  problem!: string;

  @IsEnum(MaintenanceSeverity)
  severity!: MaintenanceSeverity;
}
