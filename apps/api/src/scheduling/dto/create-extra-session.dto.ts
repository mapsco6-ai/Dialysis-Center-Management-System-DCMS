import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateExtraSessionDto {
  @IsUUID()
  patientId!: string;

  @IsDateString()
  scheduledDate!: string;

  @IsString()
  @IsNotEmpty()
  shiftId!: string;

  @IsString()
  @IsNotEmpty()
  extraReason!: string;

  @IsOptional()
  @IsUUID()
  requestedByDoctorId?: string;
}
