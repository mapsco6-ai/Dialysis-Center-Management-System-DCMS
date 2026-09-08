import { IsDateString, IsInt, IsNumber, IsOptional, Matches, Min } from "class-validator";

// arterialPressure/venousPressure/tmp are deliberately left without
// magnitude bounds - their sign and typical range depend on equipment/
// convention and this codebase has no clinical authority to assert one
// (docs review DCMS-051 flags this as needing a real spec, not an invented
// range). pulse/bp/bloodFlow/uf get unambiguous sanity checks instead:
// negative values and malformed BP strings are never valid regardless of
// convention.
export class CreateReadingDto {
  @IsOptional()
  @IsDateString()
  time?: string;

  @Matches(/^\d{2,3}\/\d{2,3}$/, { message: "bp must be in the form systolic/diastolic, e.g. 120/80" })
  bp!: string;

  @IsInt()
  @Min(1)
  pulse!: number;

  @IsOptional()
  @IsNumber()
  arterialPressure?: number;

  @IsOptional()
  @IsNumber()
  venousPressure?: number;

  @IsOptional()
  @IsNumber()
  tmp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bloodFlow?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  uf?: number;
}
