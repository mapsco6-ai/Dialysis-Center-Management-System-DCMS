import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateLabTestDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  referenceRangeLow?: number;

  @IsOptional()
  @IsNumber()
  referenceRangeHigh?: number;

  // Optional bridge to the inventory catalog - the consumable (tube,
  // needle...) this test's sample collection actually draws down. Left
  // unset, this test never consumes stock or contributes to session cost
  // (docs review Phase 11 - no fabricated consumption for a test nobody
  // configured a consumable for).
  @IsOptional()
  @IsString()
  consumableItemId?: string;

  @IsOptional()
  @IsNumber()
  consumableQuantity?: number;
}
