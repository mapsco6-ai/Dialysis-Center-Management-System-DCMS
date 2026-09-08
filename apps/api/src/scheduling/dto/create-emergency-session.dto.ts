import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateEmergencySessionDto {
  @IsUUID()
  patientId!: string;

  @IsDateString()
  scheduledDate!: string;

  @IsString()
  @IsNotEmpty()
  shiftId!: string;

  @IsOptional()
  @IsString()
  emergencySourceHospital?: string;

  @IsString()
  @IsNotEmpty()
  emergencyReason!: string;
}
