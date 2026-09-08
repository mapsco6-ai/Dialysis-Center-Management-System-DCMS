import { IsArray, IsDateString, IsNotEmpty, IsString } from "class-validator";

// Replaces the nurse's whole patient list for this ward/shift/date in one
// call - simplest to reason about, and the "no conflict" rule (docs/
// MODULES-SPEC.md Phase 7) is enforced by a DB constraint on the write, not
// here.
export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  wardId!: string;

  @IsString()
  @IsNotEmpty()
  shiftId!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @IsNotEmpty()
  nurseId!: string;

  @IsArray()
  @IsString({ each: true })
  patientIds!: string[];
}
