import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

// itemId bridges the prescription's free-text medicationName to the real
// InventoryItem the pharmacist is actually pulling from - see the
// PrescriptionDispense schema comment for why this isn't in MODULES-SPEC.md's
// minimal field list but is unavoidable in practice.
export class DispensePrescriptionDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @ApiProperty({ type: Number, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  linkedSessionId?: string;
}
