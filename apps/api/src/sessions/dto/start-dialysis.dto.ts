import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from "class-validator";

// Machine/Ward/Pre Weight/BP/Pulse are validated against what's already on
// the session (assigned machine + Pre-Dialysis record), not collected again
// here - only the fields genuinely new at START time are on this DTO
// (docs/MODULES-SPEC.md Phase 6: "يتطلب كل الحقول الإلزامية معاً").
export class StartDialysisDto {
  @IsOptional()
  @IsString()
  nurseId?: string;

  @IsString()
  @IsNotEmpty()
  dialyzerType!: string;

  @IsString()
  @IsNotEmpty()
  bloodLineType!: string;

  @IsNumber()
  prescribedDurationMinutes!: number;

  @IsNumber()
  requiredUF!: number;

  @IsOptional()
  @IsObject()
  accessInfo?: Record<string, unknown>;
}
