import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from "class-validator";

// Bounds are basic sanity checks, not clinically-approved ranges (docs
// review DCMS-051) - see the same note on pre-dialysis.dto.ts.
export class EndDialysisDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 300 })
  @IsNumber()
  @Min(1)
  @Max(300)
  postWeight!: number;

  @ApiProperty({ type: String, pattern: "^\\d{2,3}\\/\\d{2,3}$" })
  @Matches(/^\d{2,3}\/\d{2,3}$/, { message: "postBP must be in the form systolic/diastolic, e.g. 120/80" })
  postBP!: string;

  @ApiProperty({ type: "integer", minimum: 1, maximum: 300 })
  @IsInt()
  @Min(1)
  @Max(300)
  postPulse!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  @IsNumber()
  @Min(0)
  actualUF!: number;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  complications?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  finalNote?: string;
}
