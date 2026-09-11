import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Matches, Min } from "class-validator";

// arterialPressure/venousPressure/tmp are deliberately left without
// magnitude bounds - their sign and typical range depend on equipment/
// convention and this codebase has no clinical authority to assert one
// (docs review DCMS-051 flags this as needing a real spec, not an invented
// range). pulse/bp/bloodFlow/uf get unambiguous sanity checks instead:
// negative values and malformed BP strings are never valid regardless of
// convention.
export class CreateReadingDto {
  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  time?: string;

  @ApiProperty({ type: String, pattern: "^\\d{2,3}\\/\\d{2,3}$" })
  @Matches(/^\d{2,3}\/\d{2,3}$/, { message: "bp must be in the form systolic/diastolic, e.g. 120/80" })
  bp!: string;

  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  pulse!: number;

  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  arterialPressure?: number;

  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  venousPressure?: number;

  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  tmp?: number;

  @ApiProperty({ type: Number, required: false, nullable: true, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bloodFlow?: number;

  @ApiProperty({ type: Number, required: false, nullable: true, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  uf?: number;

  // Signed, single-use proof issued by POST /nursing/verify-pin (docs/
  // PROJECT-PHASES-PLAN.md Phase 7) - the record is attributed to whichever
  // user that proof names instead of the device's own session, once
  // SessionsService verifies the proof and confirms that user is active and
  // holds the same permission this endpoint requires. A bare user id here
  // would be forgeable by anyone (DCMS-055); only a valid proof token works.
  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  verifiedActorToken?: string;
}
