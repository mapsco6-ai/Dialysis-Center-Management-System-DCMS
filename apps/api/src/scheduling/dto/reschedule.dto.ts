import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsString, IsUUID } from "class-validator";

export class RescheduleDto {
  @ApiProperty({ type: String, example: "2026-10-05" })
  @IsDateString()
  scheduledDate!: string;

  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID()
  shiftId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
