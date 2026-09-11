import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class ListAuditQueryDto {
  @ApiProperty({ type: "integer", required: false, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({ type: String, required: false, format: "uuid" })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
