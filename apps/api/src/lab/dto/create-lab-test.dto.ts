import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateLabTestDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  referenceRangeLow?: number;

  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  referenceRangeHigh?: number;

  // Optional bridge to the inventory catalog - the consumable (tube,
  // needle...) this test's sample collection actually draws down. Left
  // unset, this test never consumes stock or contributes to session cost
  // (docs review Phase 11 - no fabricated consumption for a test nobody
  // configured a consumable for).
  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  consumableItemId?: string;

  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  consumableQuantity?: number;
}
