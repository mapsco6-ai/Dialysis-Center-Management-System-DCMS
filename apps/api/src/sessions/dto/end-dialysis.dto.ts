import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class EndDialysisDto {
  @IsNumber()
  postWeight!: number;

  @IsString()
  @IsNotEmpty()
  postBP!: string;

  @IsNumber()
  postPulse!: number;

  @IsNumber()
  actualUF!: number;

  @IsOptional()
  @IsString()
  complications?: string;

  @IsOptional()
  @IsString()
  finalNote?: string;
}
