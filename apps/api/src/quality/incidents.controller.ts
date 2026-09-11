import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ReportColumn, ReportExportService, ReportRow } from "../reports/report-export.service";
import { IncidentsService } from "./incidents.service";
import { CreateIncidentDto } from "./dto/create-incident.dto";
import { UpdateIncidentStatusDto } from "./dto/update-incident-status.dto";
import { ListIncidentsQueryDto } from "./dto/list-incidents-query.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

const INCIDENT_REPORT_COLUMNS: ReportColumn[] = [
  { key: "createdAt", header: "التاريخ" },
  { key: "type", header: "النوع" },
  { key: "severity", header: "الشدة" },
  { key: "status", header: "الحالة" },
  { key: "patientCode", header: "رقم المريض" },
  { key: "machineCode", header: "الجهاز" },
  { key: "reportedBy", header: "المُبلِّغ" },
  { key: "description", header: "الوصف", width: 2 },
];

@ApiTags("Quality & Safety - Incidents")
@ApiBearerAuth("bearer")
@Controller("incidents")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly exportService: ReportExportService,
  ) {}

  // "الإنشاء متاح لأي كادر طبي/تمريضي" (docs/MODULES-SPEC.md Phase 15) -
  // deliberately narrower than the view/review permissions below, same
  // shape as machine.fault.report not implying machine.view in Phase 12.
  @Post()
  @RequirePermissions("incident.report")
  create(@Body() dto: CreateIncidentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.incidentsService.create(dto, actor);
  }

  @Get()
  @RequireAnyPermission("incident.view", "incident.review")
  async list(@Query() query: ListIncidentsQueryDto, @Res() res: Response) {
    const incidents = await this.incidentsService.list(query);
    const rows: ReportRow[] = incidents.map((i) => ({
      createdAt: i.createdAt.toISOString(),
      type: i.type,
      severity: i.severity,
      status: i.status,
      patientCode: i.patient?.patientCode ?? "",
      machineCode: i.machine?.machineCode ?? "",
      reportedBy: i.reportedBy.fullName,
      description: i.description,
    }));
    await this.exportService.respond(res, query.format, "incident-report", "تقرير الحوادث", INCIDENT_REPORT_COLUMNS, rows, incidents);
  }

  @Get(":id")
  @RequireAnyPermission("incident.view", "incident.review")
  findOne(@Param("id") id: string) {
    return this.incidentsService.findOne(id);
  }

  // "المراجعة/الإغلاق لـMEDICAL_DIRECTOR" - no DELETE route exists anywhere
  // in this controller (docs acceptance criterion 4).
  @Post(":id/status")
  @RequirePermissions("incident.review")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateIncidentStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.incidentsService.updateStatus(id, dto, actor);
  }
}
