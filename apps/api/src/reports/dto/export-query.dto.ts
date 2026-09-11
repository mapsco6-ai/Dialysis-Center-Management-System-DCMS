import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

export type ReportFormat = "pdf" | "excel";

export class ExportQueryDto {
  @ApiProperty({ enum: ["pdf", "excel"], required: false, nullable: true })
  @IsOptional()
  @IsIn(["pdf", "excel"])
  format?: ReportFormat;
}
