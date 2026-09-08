import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateReadingDto {
  @IsOptional()
  @IsDateString()
  time?: string;

  @IsString()
  @IsNotEmpty()
  bp!: string;

  @IsNumber()
  pulse!: number;

  @IsOptional()
  @IsNumber()
  arterialPressure?: number;

  @IsOptional()
  @IsNumber()
  venousPressure?: number;

  @IsOptional()
  @IsNumber()
  tmp?: number;

  @IsOptional()
  @IsNumber()
  bloodFlow?: number;

  @IsOptional()
  @IsNumber()
  uf?: number;
}
