import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateMachineDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  machineCode!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  wardId!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ type: Boolean, required: false, nullable: true })
  @IsOptional()
  @IsBoolean()
  isEmergencyDedicated?: boolean;

  @ApiProperty({ type: Boolean, required: false, nullable: true })
  @IsOptional()
  @IsBoolean()
  isProtected?: boolean;
}
