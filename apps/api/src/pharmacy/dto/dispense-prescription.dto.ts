import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

// itemId bridges the prescription's free-text medicationName to the real
// InventoryItem the pharmacist is actually pulling from - see the
// PrescriptionDispense schema comment for why this isn't in MODULES-SPEC.md's
// minimal field list but is unavoidable in practice.
export class DispensePrescriptionDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsOptional()
  @IsString()
  linkedSessionId?: string;
}
