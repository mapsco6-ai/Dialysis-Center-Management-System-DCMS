import { ScheduleStatus } from "@prisma/client";
import { IsEnum, IsOptional, Matches } from "class-validator";

export class GetScheduleQueryDto {
  // A plain calendar day only - no time/offset component. @IsDateString()
  // used to accept a full timestamp like
  // "2026-09-10T00:30:00+03:00", which toDateOnly() then silently
  // re-normalizes to UTC midnight - 2026-09-09 here, a different day than
  // what the caller wrote (DCMS-033). Requiring YYYY-MM-DD removes the
  // ambiguity instead of guessing which day the caller meant.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be a calendar date in the form YYYY-MM-DD" })
  date!: string;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;
}
