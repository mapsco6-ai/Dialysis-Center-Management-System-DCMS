import { IsDateString, IsOptional, IsString } from "class-validator";

export class WardDashboardQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  shiftId?: string;
}
