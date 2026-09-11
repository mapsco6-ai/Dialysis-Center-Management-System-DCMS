import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateEmergencySessionDto {
  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID()
  patientId!: string;

  @ApiProperty({ type: String })
  @IsDateString()
  scheduledDate!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  shiftId!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  emergencySourceHospital?: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  emergencyReason!: string;
}
