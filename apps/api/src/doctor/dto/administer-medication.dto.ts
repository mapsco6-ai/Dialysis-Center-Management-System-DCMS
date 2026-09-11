import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class AdministerMedicationDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  doseGiven!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
