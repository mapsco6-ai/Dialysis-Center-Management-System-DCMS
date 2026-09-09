import { IsOptional, IsString } from "class-validator";
import { DateRangeQueryDto } from "./date-range-query.dto";

export class UtilizationQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsString()
  wardId?: string;
}
