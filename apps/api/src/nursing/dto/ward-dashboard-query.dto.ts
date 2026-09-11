import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString } from "class-validator";

export class WardDashboardQueryDto {
  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  shiftId?: string;
}
