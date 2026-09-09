import { Matches } from "class-validator";
import { ExportQueryDto } from "./export-query.dto";

export class MonthQueryDto extends ExportQueryDto {
  @Matches(/^\d{4}-\d{2}$/, { message: "month must be in the form YYYY-MM" })
  month!: string;
}
