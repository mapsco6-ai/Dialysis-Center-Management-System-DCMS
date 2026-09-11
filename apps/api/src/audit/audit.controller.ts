import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { AuditService } from "./audit.service";
import { ListAuditQueryDto } from "./dto/list-audit-query.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Audit")
@ApiBearerAuth("bearer")
@Controller("audit-logs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions("audit.view")
  findAll(@Query() query: ListAuditQueryDto) {
    return this.auditService.findAll(query);
  }
}
