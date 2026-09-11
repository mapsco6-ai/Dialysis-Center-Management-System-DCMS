import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";

export class TrendQueryDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ type: "integer", required: false, nullable: true, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
