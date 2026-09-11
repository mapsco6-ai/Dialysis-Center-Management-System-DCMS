import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateExtraSessionDto {
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

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  extraReason!: string;

  @ApiProperty({ type: String, required: false, nullable: true, format: "uuid" })
  @IsOptional()
  @IsUUID()
  requestedByDoctorId?: string;
}
