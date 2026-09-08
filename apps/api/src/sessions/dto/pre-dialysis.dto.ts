import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from "class-validator";

// Weight/BP/Pulse are required here because START DIALYSIS later validates
// they're already on file (docs/MODULES-SPEC.md Phase 6) - collecting them
// as optional here would just move the rejection one step later.
//
// Bounds below are basic sanity checks (reject negatives/typos like a
// pulse of -1), not clinically-approved ranges - confirm real limits with
// medical staff before relying on this for anything beyond catching
// data-entry mistakes (docs review DCMS-051).
export class PreDialysisDto {
  @IsNumber()
  @Min(1)
  @Max(300)
  weight!: number;

  @Matches(/^\d{2,3}\/\d{2,3}$/, { message: "bp must be in the form systolic/diastolic, e.g. 120/80" })
  bp!: string;

  @IsInt()
  @Min(1)
  @Max(300)
  pulse!: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(45)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  glucose?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(300)
  dryWeight?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
