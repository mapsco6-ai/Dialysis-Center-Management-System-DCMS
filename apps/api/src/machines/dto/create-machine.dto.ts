import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateMachineDto {
  @IsString()
  @IsNotEmpty()
  machineCode!: string;

  @IsString()
  @IsNotEmpty()
  wardId!: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsBoolean()
  isEmergencyDedicated?: boolean;

  @IsOptional()
  @IsBoolean()
  isProtected?: boolean;
}
