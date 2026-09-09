import { IsIn, IsOptional } from "class-validator";
import { DateRangeQueryDto } from "./date-range-query.dto";

export class PeriodSummaryQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsIn(["day", "week", "month"])
  groupBy?: "day" | "week" | "month";
}
