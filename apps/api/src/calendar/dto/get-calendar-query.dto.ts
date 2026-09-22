import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class GetCalendarQueryDto {
  @ApiProperty({ type: String, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @Matches(DATE_ONLY, { message: "from must be a calendar date in the form YYYY-MM-DD" })
  from!: string;

  @ApiProperty({ type: String, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @Matches(DATE_ONLY, { message: "to must be a calendar date in the form YYYY-MM-DD" })
  to!: string;
}
