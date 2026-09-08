import { IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Max, Min } from "class-validator";

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

  // prescribedDurationMinutes is stored as an Int - IsNumber alone would
  // accept 240.5 and fail later at the DB instead of at validation
  // (docs review DCMS-051).
  @IsInt()
  @Min(1)
  @Max(600)
  prescribedDurationMinutes!: number;

  // UF is treated as a non-negative withdrawal volume throughout this
  // module (docs review DCMS-051) - confirm the real clinical bound with
  // medical staff, this only rejects negatives/typos.
  @IsNumber()
  @Min(0)
  requiredUF!: number;

  @IsOptional()
  @IsObject()
  accessInfo?: Record<string, unknown>;
}
