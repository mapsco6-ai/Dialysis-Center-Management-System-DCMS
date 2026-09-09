import { IsIn, IsOptional } from "class-validator";

export type ReportFormat = "pdf" | "excel";

export class ExportQueryDto {
  @IsOptional()
  @IsIn(["pdf", "excel"])
  format?: ReportFormat;
}
