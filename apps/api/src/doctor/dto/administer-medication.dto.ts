import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class AdministerMedicationDto {
  @IsString()
  @IsNotEmpty()
  doseGiven!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
