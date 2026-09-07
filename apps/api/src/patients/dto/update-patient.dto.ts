import { Gender, PatientStatus, VascularAccessType } from "@prisma/client";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";

export class UpdatePatientDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  fileNumber?: string;

  @IsOptional()
  @IsEnum(PatientStatus)
  status?: PatientStatus;

  @IsOptional()
  @IsDateString()
  dialysisStartDate?: string;

  @IsOptional()
  @IsNumber()
  dryWeight?: number;

  @IsOptional()
  @IsEnum(VascularAccessType)
  vascularAccessType?: VascularAccessType;

  @IsOptional()
  @IsString()
  vascularAccessLocation?: string;

  @IsOptional()
  @IsString()
  diagnoses?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chronicDiseases?: string[];

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  medicalNotes?: string;

  @IsOptional()
  @IsString()
  specialInstructions?: string;

  // Mandatory only when this update touches dryWeight/vascularAccess* (enforced
  // in PatientsService, not here, since it depends on which fields are present).
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
