import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, Matches } from "class-validator";
import { ExportQueryDto } from "./export-query.dto";

export class DayQueryDto extends ExportQueryDto {
  @ApiProperty({ type: String, required: false, nullable: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be in the form YYYY-MM-DD" })
  date?: string;
}
