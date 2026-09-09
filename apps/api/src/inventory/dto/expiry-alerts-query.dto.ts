import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class ExpiryAlertsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  withinDays?: number;
}
