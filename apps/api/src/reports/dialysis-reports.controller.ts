import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { DialysisReportsService } from "./dialysis-reports.service";
import { ReportExportService } from "./report-export.service";
import { DayQueryDto } from "./dto/day-query.dto";
import { PeriodSummaryQueryDto } from "./dto/period-summary-query.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Reports - Dialysis")
@ApiBearerAuth("bearer")
@Controller("reports/dialysis")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireAnyPermission("scheduling.manage", "dialysis.session.view")
export class DialysisReportsController {
  constructor(
    private readonly dialysisReportsService: DialysisReportsService,
    private readonly exportService: ReportExportService,
  ) {}

  @Get("daily-sessions-by-ward")
  async dailySessionsByWard(@Query() query: DayQueryDto, @Res() res: Response) {
    const date = query.date ?? new Date().toISOString().slice(0, 10);
    const { columns, rows, json } = await this.dialysisReportsService.dailySessionsByWard(date);
    await this.exportService.respond(res, query.format, `dialysis-daily-${date}`, `جلسات اليوم حسب الردهة - ${date}`, columns, rows, json);
  }

  @Get("summary")
  async summary(@Query() query: PeriodSummaryQueryDto, @Res() res: Response) {
    const to = query.to ?? new Date().toISOString().slice(0, 10);
    const from = query.from ?? to;
    const { columns, rows, json } = await this.dialysisReportsService.periodSummary(from, to, query.groupBy);
    await this.exportService.respond(res, query.format, `dialysis-summary-${from}-${to}`, "ملخص جلسات الديلزة", columns, rows, json);
  }
}
