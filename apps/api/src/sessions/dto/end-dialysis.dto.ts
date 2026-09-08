import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from "class-validator";

// Bounds are basic sanity checks, not clinically-approved ranges (docs
// review DCMS-051) - see the same note on pre-dialysis.dto.ts.
export class EndDialysisDto {
  @IsNumber()
  @Min(1)
  @Max(300)
  postWeight!: number;

  @Matches(/^\d{2,3}\/\d{2,3}$/, { message: "postBP must be in the form systolic/diastolic, e.g. 120/80" })
  postBP!: string;

  @IsInt()
  @Min(1)
  @Max(300)
  postPulse!: number;

  @IsNumber()
  @Min(0)
  actualUF!: number;

  @IsOptional()
  @IsString()
  complications?: string;

  @IsOptional()
  @IsString()
  finalNote?: string;
}
