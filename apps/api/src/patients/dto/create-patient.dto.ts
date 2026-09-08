import { Gender, VascularAccessType } from "@prisma/client";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { IsNotFutureDateString } from "../../common/validators/not-future-date.validator";

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsDateString()
  @IsNotFutureDateString()
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
  @IsNotFutureDateString()
  dialysisStartDate?: string;

  // Bounds are a basic sanity check (reject negative/typo values like 9999),
  // not a clinically-approved range - confirm real limits with medical staff
  // before relying on this for anything beyond catching data-entry mistakes.
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(300)
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
