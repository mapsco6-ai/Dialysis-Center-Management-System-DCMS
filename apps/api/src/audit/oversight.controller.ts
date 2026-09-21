import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { AuditService } from "./audit.service";
import { AuditSealService } from "./audit-seal.service";
import { SettingsService } from "../settings/settings.service";
import { AuditFilterDto } from "./dto/audit-filter.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

// Oversight views over the append-only audit log: per-employee activity,
// per-patient history and a CSV export for health-authority inspections.
@ApiTags("Audit")
@ApiBearerAuth("bearer")
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OversightController {
  constructor(
    private readonly auditService: AuditService,
    private readonly sealService: AuditSealService,
    private readonly settings: SettingsService,
  ) {}

  @Get("audit-logs/search")
  @RequirePermissions("audit.view")
  search(@Query() filter: AuditFilterDto) {
    return this.auditService.search(filter);
  }

  // Exporting is itself an auditable act.
  @Get("audit-logs/export")
  @RequirePermissions("audit.export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="audit-log.csv"')
  async export(@Query() filter: AuditFilterDto, @CurrentUser() actor: AuthenticatedUser) {
    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "AUDIT_EXPORTED",
      entityType: "AuditLog",
      entityId: "export",
      newValue: filter,
    });
    return this.auditService.exportCsv(filter);
  }

  // Re-walks the hash chain; any edit/deletion of sealed audit rows shows up.
  @Get("audit-logs/verify")
  @RequirePermissions("audit.view")
  verify() {
    return this.sealService.verify();
  }

  // The trail is append-only and never deleted; this tells the operator how
  // much of it is past the configured retention and can be archived
  // (exported to cold storage) - deleting stays impossible.
  @Get("audit-logs/retention")
  @RequirePermissions("audit.view")
  async retention() {
    const years = await this.settings.get<number>("auditRetentionYears");
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    return { retentionYears: years, cutoff, ...(await this.auditService.retentionStats(cutoff)) };
  }

  @Get("audit-logs/patients/:patientId")
  @RequireAnyPermission("audit.view", "quality.audit.view")
  patientHistory(@Param("patientId", ParseUUIDPipe) patientId: string, @Query() filter: AuditFilterDto) {
    return this.auditService.patientHistory(patientId, filter);
  }

  @Get("users/:id/activity")
  @RequirePermissions("audit.view")
  userActivity(@Param("id", ParseUUIDPipe) id: string, @Query() filter: AuditFilterDto) {
    return this.auditService.activity(id, filter);
  }

  // Every employee can see their own record.
  @Get("me/activity")
  myActivity(@CurrentUser() actor: AuthenticatedUser, @Query() filter: AuditFilterDto) {
    return this.auditService.activity(actor.id, filter);
  }
}
