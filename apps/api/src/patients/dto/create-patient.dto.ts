import { Gender, VascularAccessType } from "@prisma/client";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsDateString()
  dateOfBirth!: string;

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
}
