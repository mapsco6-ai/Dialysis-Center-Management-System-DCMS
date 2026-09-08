import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { LabResultsService } from "./lab-results.service";
import { TrendQueryDto } from "./dto/trend-query.dto";

const DEFAULT_TREND_LIMIT = 5;

@Controller("lab/tests/:testId/trend")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabTrendController {
  constructor(private readonly labResultsService: LabResultsService) {}

  @Get()
  @RequirePermissions("patient.view")
  trend(@Param("testId") testId: string, @Query() query: TrendQueryDto) {
    return this.labResultsService.trend(testId, query.patientId, query.limit ?? DEFAULT_TREND_LIMIT);
  }
}
