import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { DateRangeQueryDto } from "./date-range-query.dto";

export class PeriodSummaryQueryDto extends DateRangeQueryDto {
  @ApiProperty({ enum: ["day", "week", "month"], required: false, nullable: true })
  @IsOptional()
  @IsIn(["day", "week", "month"])
  groupBy?: "day" | "week" | "month";
}
