import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { ReportColumn, ReportExportService } from "../reports/report-export.service";
import { ExportQueryDto } from "../reports/dto/export-query.dto";
import { ClinicalAuditService } from "./clinical-audit.service";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

const AUDIT_COLUMNS: ReportColumn[] = [
  { key: "timestamp", header: "التاريخ" },
  { key: "source", header: "المصدر" },
  { key: "actor", header: "المستخدم" },
  { key: "action", header: "الإجراء", width: 2 },
  { key: "entityType", header: "الكيان" },
  { key: "reason", header: "السبب", width: 2 },
];

@ApiTags("Quality & Safety - Clinical Audit")
@ApiBearerAuth("bearer")
@Controller("quality/clinical-audit")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("quality.audit.view")
export class ClinicalAuditController {
  constructor(
    private readonly clinicalAuditService: ClinicalAuditService,
    private readonly exportService: ReportExportService,
  ) {}

  @Get(":patientId")
  async getPatientAudit(@Param("patientId") patientId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    const result = await this.clinicalAuditService.getPatientAudit(patientId);
    await this.exportService.respond(res, query.format, `clinical-audit-${patientId}`, "التدقيق السريري", AUDIT_COLUMNS, result.rows, result);
  }
}
