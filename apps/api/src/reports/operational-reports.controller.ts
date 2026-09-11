import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { OperationalReportsService } from "./operational-reports.service";
import { ReportExportService } from "./report-export.service";
import { DateRangeQueryDto } from "./dto/date-range-query.dto";
import { MonthQueryDto } from "./dto/month-query.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

function defaultRange(from?: string, to?: string, fallbackDays = 30): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const fallbackFrom = new Date(Date.now() - fallbackDays * 86_400_000).toISOString().slice(0, 10);
  return { from: from ?? fallbackFrom, to: to ?? today };
}

// Each route carries its own permission (docs/PROJECT-PHASES-PLAN.md Phase
// 14 acceptance criterion 5: a Pharmacy-only user must NOT see the Lab
// report) - deliberately no class-level @RequirePermissions here, since the
// three reports below belong to three different modules with unrelated
// permission sets.
@ApiTags("Reports - Operations")
@ApiBearerAuth("bearer")
@Controller("reports/operations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OperationalReportsController {
  constructor(
    private readonly operationalReportsService: OperationalReportsService,
    private readonly exportService: ReportExportService,
  ) {}

  @Get("stock-movements")
  @RequirePermissions("inventory.view")
  async stockMovements(@Query() query: DateRangeQueryDto, @Res() res: Response) {
    const { from, to } = defaultRange(query.from, query.to);
    const { columns, rows, json } = await this.operationalReportsService.stockMovements(from, to);
    await this.exportService.respond(res, query.format, `stock-movements-${from}-${to}`, "حركات المخزون", columns, rows, json);
  }

  @Get("drug-consumption")
  @RequirePermissions("pharmacy.dispense")
  async drugConsumption(@Query() query: MonthQueryDto, @Res() res: Response) {
    const { columns, rows, json } = await this.operationalReportsService.drugConsumption(query.month);
    await this.exportService.respond(res, query.format, `drug-consumption-${query.month}`, "استهلاك الأدوية", columns, rows, json);
  }

  @Get("lab-volume")
  @RequirePermissions("lab.queue.view")
  async labVolume(@Query() query: DateRangeQueryDto, @Res() res: Response) {
    const { from, to } = defaultRange(query.from, query.to);
    const { columns, rows, json } = await this.operationalReportsService.labVolume(from, to);
    await this.exportService.respond(res, query.format, `lab-volume-${from}-${to}`, "حجم عمل المختبر", columns, rows, json);
  }
}
