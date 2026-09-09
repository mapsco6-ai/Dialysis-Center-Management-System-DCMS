import { Matches } from "class-validator";

export class ConsumptionReportQueryDto {
  @Matches(/^\d{4}-\d{2}$/, { message: "month must be in the form YYYY-MM" })
  month!: string;
}
