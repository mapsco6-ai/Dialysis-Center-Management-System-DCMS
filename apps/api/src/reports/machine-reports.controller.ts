import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { MachineReportsService } from "./machine-reports.service";
import { ReportExportService } from "./report-export.service";
import { UtilizationQueryDto } from "./dto/utilization-query.dto";
import { DateRangeQueryDto } from "./dto/date-range-query.dto";
import { ExportQueryDto } from "./dto/export-query.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

function defaultRange(from?: string, to?: string, fallbackDays = 0): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const fallbackFrom = new Date(Date.now() - fallbackDays * 86_400_000).toISOString().slice(0, 10);
  return { from: from ?? fallbackFrom, to: to ?? today };
}

@ApiTags("Reports - Machines")
@ApiBearerAuth("bearer")
@Controller("reports/machines")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireAnyPermission("machine.view", "maintenance.manage")
export class MachineReportsController {
  constructor(
    private readonly machineReportsService: MachineReportsService,
    private readonly exportService: ReportExportService,
  ) {}

  @Get("utilization")
  async utilization(@Query() query: UtilizationQueryDto, @Res() res: Response) {
    const { from, to } = defaultRange(query.from, query.to);
    const { columns, rows, json } = await this.machineReportsService.utilization(from, to, query.wardId);
    await this.exportService.respond(res, query.format, `machines-utilization-${from}-${to}`, "نسبة إشغال الأجهزة", columns, rows, json);
  }

  @Get("failure-frequency")
  async failureFrequency(@Query() query: DateRangeQueryDto, @Res() res: Response) {
    const { from, to } = defaultRange(query.from, query.to);
    const { columns, rows, json } = await this.machineReportsService.failureFrequency(from, to);
    await this.exportService.respond(res, query.format, `machines-failures-${from}-${to}`, "تكرار الأعطال", columns, rows, json);
  }

  @Get(":machineId/downtime")
  async downtime(@Param("machineId") machineId: string, @Query() query: DateRangeQueryDto, @Res() res: Response) {
    const { from, to } = defaultRange(query.from, query.to, 7);
    const { columns, rows, json } = await this.machineReportsService.downtime(machineId, from, to);
    await this.exportService.respond(res, query.format, `machine-downtime-${machineId}`, "تقرير التوقف", columns, rows, json);
  }

  @Get(":machineId/maintenance-history")
  async maintenanceHistory(@Param("machineId") machineId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    const { columns, rows, json } = await this.machineReportsService.maintenanceHistory(machineId);
    await this.exportService.respond(res, query.format, `machine-maintenance-${machineId}`, "سجل الصيانة", columns, rows, json);
  }
}
