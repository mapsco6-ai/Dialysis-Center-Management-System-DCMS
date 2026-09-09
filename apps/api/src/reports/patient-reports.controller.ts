import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { PatientReportsService } from "./patient-reports.service";
import { ReportExportService } from "./report-export.service";
import { ExportQueryDto } from "./dto/export-query.dto";
import { DateRangeQueryDto } from "./dto/date-range-query.dto";
import { MonthQueryDto } from "./dto/month-query.dto";

@Controller("reports/patients/:patientId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("patient.view")
export class PatientReportsController {
  constructor(
    private readonly patientReportsService: PatientReportsService,
    private readonly exportService: ReportExportService,
  ) {}

  @Get("summary")
  async summary(@Param("patientId") patientId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    const { columns, rows, json } = await this.patientReportsService.summary(patientId);
    await this.exportService.respond(res, query.format, `patient-summary-${patientId}`, "ملخص المريض", columns, rows, json);
  }

  @Get("session-history")
  async sessionHistory(@Param("patientId") patientId: string, @Query() query: DateRangeQueryDto, @Res() res: Response) {
    const { columns, rows, json } = await this.patientReportsService.sessionHistory(patientId, query.from, query.to);
    await this.exportService.respond(res, query.format, `patient-sessions-${patientId}`, "تاريخ الجلسات", columns, rows, json);
  }

  @Get("medication-history")
  async medicationHistory(@Param("patientId") patientId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    const { columns, rows, json } = await this.patientReportsService.medicationHistory(patientId);
    await this.exportService.respond(res, query.format, `patient-medications-${patientId}`, "تاريخ الأدوية", columns, rows, json);
  }

  @Get("lab-history")
  async labHistory(@Param("patientId") patientId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    const { columns, rows, json } = await this.patientReportsService.labHistory(patientId);
    await this.exportService.respond(res, query.format, `patient-lab-${patientId}`, "تاريخ المختبر", columns, rows, json);
  }

  @Get("absences")
  async absences(@Param("patientId") patientId: string, @Query() query: DateRangeQueryDto, @Res() res: Response) {
    const { columns, rows, json } = await this.patientReportsService.absences(patientId, query.from, query.to);
    await this.exportService.respond(res, query.format, `patient-absences-${patientId}`, "تاريخ الغياب", columns, rows, json);
  }

  @Get("emergency-sessions")
  async emergencySessions(@Param("patientId") patientId: string, @Query() query: DateRangeQueryDto, @Res() res: Response) {
    const { columns, rows, json } = await this.patientReportsService.emergencySessions(patientId, query.from, query.to);
    await this.exportService.respond(res, query.format, `patient-emergency-${patientId}`, "جلسات الطوارئ", columns, rows, json);
  }

  @Get("consumption")
  async consumption(@Param("patientId") patientId: string, @Query() query: MonthQueryDto, @Res() res: Response) {
    const { columns, rows, json } = await this.patientReportsService.consumption(patientId, query.month);
    await this.exportService.respond(res, query.format, `patient-consumption-${patientId}`, "استهلاك المريض", columns, rows, json);
  }
}
