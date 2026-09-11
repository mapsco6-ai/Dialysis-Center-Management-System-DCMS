import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { DateRangeQueryDto } from "./date-range-query.dto";

export class UtilizationQueryDto extends DateRangeQueryDto {
  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  wardId?: string;
}
