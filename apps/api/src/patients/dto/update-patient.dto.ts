import { Gender, PatientStatus, VascularAccessType } from "@prisma/client";
import { Transform } from "class-transformer";
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
  ValidateIf,
} from "class-validator";
import { IsNotFutureDateString } from "../../common/validators/not-future-date.validator";

export class UpdatePatientDto {
  // @ValidateIf (not @IsOptional) so an explicit `null` is rejected with a
  // clean 400 instead of reaching Prisma and failing on a NOT NULL column
  // (docs review DCMS-016). @IsOptional treats null and "omitted" the same,
  // which is wrong for fields that can never legitimately be nulled.
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(Gender)
  gender?: Gender;

  @ValidateIf((_, value) => value !== undefined)
  @IsDateString()
  @IsNotFutureDateString()
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

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(PatientStatus)
  status?: PatientStatus;

  // Genuinely nullable in the schema: null here means "clear it", distinct
  // from omitted ("leave it alone") - see PatientsService.update.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  @IsNotFutureDateString()
  dialysisStartDate?: string | null;

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

  // Mandatory only when this update touches dryWeight/vascularAccess* (enforced
  // in PatientsService, not here, since it depends on which fields are present).
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
