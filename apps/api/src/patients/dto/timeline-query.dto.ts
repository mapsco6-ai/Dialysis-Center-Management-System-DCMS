import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class TimelineQueryDto {
  @ApiProperty({ type: "integer", required: false, minimum: 1, description: "Presence switches the response to { data, total }" })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @ApiProperty({ type: "integer", required: false, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;

  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() type?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsDateString() from?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsDateString() to?: string;
  @ApiProperty({ type: String, required: false, description: "Break-the-glass reason for restricted charts" }) @IsOptional() @IsString() reason?: string;
}
