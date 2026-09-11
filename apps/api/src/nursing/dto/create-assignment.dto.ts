import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsDateString, IsNotEmpty, IsString } from "class-validator";

// Replaces the nurse's whole patient list for this ward/shift/date in one
// call - simplest to reason about, and the "no conflict" rule (docs/
// MODULES-SPEC.md Phase 7) is enforced by a DB constraint on the write, not
// here.
export class CreateAssignmentDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  wardId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  shiftId!: string;

  @ApiProperty({ type: String })
  @IsDateString()
  date!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  nurseId!: string;

  @ApiProperty({ type: () => [String] })
  @IsArray()
  @IsString({ each: true })
  patientIds!: string[];
}
