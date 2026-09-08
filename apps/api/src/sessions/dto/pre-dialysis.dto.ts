import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

// Weight/BP/Pulse are required here because START DIALYSIS later validates
// they're already on file (docs/MODULES-SPEC.md Phase 6) - collecting them
// as optional here would just move the rejection one step later.
export class PreDialysisDto {
  @IsNumber()
  weight!: number;

  @IsString()
  @IsNotEmpty()
  bp!: string;

  @IsNumber()
  pulse!: number;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  glucose?: number;

  @IsOptional()
  @IsNumber()
  dryWeight?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
