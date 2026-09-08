import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateLabTestDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  referenceRangeLow?: number;

  @IsOptional()
  @IsNumber()
  referenceRangeHigh?: number;
}
