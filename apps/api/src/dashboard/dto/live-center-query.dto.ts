import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, Matches } from "class-validator";

export class LiveCenterQueryDto {
  // Plain calendar date only, same reasoning as GetScheduleQueryDto
  // (docs review DCMS-033) - a full timestamp's UTC normalization could
  // silently land on a different day than the caller meant.
  @ApiProperty({ type: String, required: false, nullable: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be in the form YYYY-MM-DD" })
  date?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  shiftId?: string;
}
