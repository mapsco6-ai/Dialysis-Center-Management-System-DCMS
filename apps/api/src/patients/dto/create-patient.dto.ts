import { ApiProperty } from "@nestjs/swagger";
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
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender!: Gender;

  @ApiProperty({ type: String })
  @IsDateString()
  @IsNotFutureDateString()
  dateOfBirth!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  fileNumber?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  @IsNotFutureDateString()
  dialysisStartDate?: string;

  // Bounds are a basic sanity check (reject negative/typo values like 9999),
  // not a clinically-approved range - confirm real limits with medical staff
  // before relying on this for anything beyond catching data-entry mistakes.
  @ApiProperty({ type: Number, required: false, nullable: true, minimum: 1, maximum: 300 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(300)
  dryWeight?: number;

  @ApiProperty({ enum: VascularAccessType, required: false, nullable: true })
  @IsOptional()
  @IsEnum(VascularAccessType)
  vascularAccessType?: VascularAccessType;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  vascularAccessLocation?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  diagnoses?: string;

  @ApiProperty({ type: () => [String], required: false, nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chronicDiseases?: string[];

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  medicalNotes?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  specialInstructions?: string;
}
