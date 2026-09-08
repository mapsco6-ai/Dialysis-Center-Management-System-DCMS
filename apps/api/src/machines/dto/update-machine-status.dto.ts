import { Transform } from "class-transformer";
import { IsIn, IsNotEmpty, IsString } from "class-validator";

// IN_USE / RESERVED / EMERGENCY_RESERVED / APPROVAL_REQUIRED are outcomes of
// MachinesService.assignMachine / decideApproval specifically - not settable
// through this generic endpoint (docs/MODULES-SPEC.md: transitions go
// through "one central service", but each has its own more precise trigger).
const GENERIC_TARGET_STATUSES = ["AVAILABLE", "CLEANING", "WAITING_CLEANING", "MAINTENANCE", "OUT_OF_SERVICE"] as const;
export type GenericMachineStatus = (typeof GENERIC_TARGET_STATUSES)[number];

export class UpdateMachineStatusDto {
  @IsIn(GENERIC_TARGET_STATUSES)
  status!: GenericMachineStatus;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
