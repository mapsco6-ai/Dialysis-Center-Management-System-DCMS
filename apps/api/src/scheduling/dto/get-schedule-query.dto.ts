import { ScheduleStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional } from "class-validator";

export class GetScheduleQueryDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;
}
