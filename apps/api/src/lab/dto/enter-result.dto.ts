import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

// flagCritical is a deliberate, manual judgment call by whoever enters the
// result - not an automatic reference-range comparison. Auto-firing a
// clinical alert from a number crossing a threshold would be exactly the
// kind of new automatic Clinical Rule that docs/PROJECT-PHASES-PLAN.md
// Phase 12 requires the medical director to approve before activation;
// this codebase has no such approval, so the alert only fires when a human
// explicitly asks for it here.
export class EnterResultDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  value!: string;

  @ApiProperty({ type: Boolean, required: false, nullable: true })
  @IsOptional()
  @IsBoolean()
  flagCritical?: boolean;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  alertMessage?: string;
}
