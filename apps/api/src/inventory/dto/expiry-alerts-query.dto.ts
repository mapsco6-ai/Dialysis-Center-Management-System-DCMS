import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class ExpiryAlertsQueryDto {
  @ApiProperty({ type: "integer", required: false, nullable: true, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  withinDays?: number;
}
