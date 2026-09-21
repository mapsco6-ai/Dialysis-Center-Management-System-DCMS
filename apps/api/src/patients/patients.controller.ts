import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PatientsService } from "./patients.service";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { CreateAlertDto } from "./dto/create-alert.dto";
import { ResolveAlertDto } from "./dto/resolve-alert.dto";
import { ListPatientsQueryDto } from "./dto/list-patients-query.dto";
import { LogAccess } from "../common/decorators/log-access.decorator";
import { TimelineQueryDto } from "./dto/timeline-query.dto";
import { CreateAccessRecordDto, SetRestrictedDto, UpdateAccessRecordDto } from "./dto/access-record.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Patients")
@ApiBearerAuth("bearer")
@Controller("patients")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @RequirePermissions("patient.create")
  create(@Body() dto: CreatePatientDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.patientsService.create(dto, actor);
  }

  @Get()
  @RequirePermissions("patient.view")
  findAll(@Query() query: ListPatientsQueryDto) {
    return this.patientsService.findAll(query.page, query.limit, query.status);
  }

  // Must be declared before ':id' so "search" isn't captured as a patient id.
  @Get("search")
  @RequirePermissions("patient.view")
  search(@Query("q") q?: string) {
    if (!q || !q.trim()) {
      throw new BadRequestException("Query parameter 'q' is required");
    }
    return this.patientsService.search(q.trim());
  }

  // Must be declared before ':id' for the same reason.
  @Get("barcode/:code")
  @RequirePermissions("patient.view")
  findByBarcode(@Param("code") code: string) {
    return this.patientsService.findByBarcode(code);
  }

  @Get(":id")
  @RequirePermissions("patient.view")
  @LogAccess("PATIENT_VIEWED")
  async findOne(@Param("id") id: string, @Query("reason") reason: string | undefined, @CurrentUser() actor: AuthenticatedUser) {
    await this.patientsService.assertChartAccess(id, actor, reason);
    return this.patientsService.findOne(id);
  }

  @Patch(":id")
  @RequirePermissions("patient.edit")
  update(
    @Param("id") id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.patientsService.update(id, dto, actor);
  }

  // One call for the chart header: profile, open alerts, latest session/lab,
  // active meds and upcoming appointments.
  @Get(":id/overview")
  @RequirePermissions("patient.view")
  @LogAccess("PATIENT_VIEWED")
  async overview(@Param("id") id: string, @Query("reason") reason: string | undefined, @CurrentUser() actor: AuthenticatedUser) {
    await this.patientsService.assertChartAccess(id, actor, reason);
    return this.patientsService.overview(id);
  }

  // Without ?page it returns the full array exactly as before (existing
  // clients); with ?page it returns { data, total } filtered by type/date.
  @Get(":id/timeline")
  @RequirePermissions("patient.view")
  @LogAccess("PATIENT_TIMELINE_VIEWED")
  async getTimeline(@Param("id") id: string, @Query() query: TimelineQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    await this.patientsService.assertChartAccess(id, actor, query.reason);
    return this.patientsService.getTimeline(id, query);
  }

  @Post(":id/restrict")
  @RequirePermissions("patient.edit")
  restrict(@Param("id") id: string, @Body() dto: SetRestrictedDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.patientsService.setRestricted(id, dto.restricted, dto.reason, actor);
  }

  @Get(":id/access-records")
  @RequirePermissions("patient.view")
  listAccessRecords(@Param("id") id: string) {
    return this.patientsService.listAccessRecords(id);
  }

  @Post(":id/access-records")
  @RequirePermissions("patient.edit")
  createAccessRecord(@Param("id") id: string, @Body() dto: CreateAccessRecordDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.patientsService.createAccessRecord(id, dto, actor);
  }

  @Patch(":id/access-records/:recordId")
  @RequirePermissions("patient.edit")
  closeAccessRecord(@Param("id") id: string, @Param("recordId") recordId: string, @Body() dto: UpdateAccessRecordDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.patientsService.closeAccessRecord(id, recordId, dto, actor);
  }

  @Get(":id/alerts")
  @RequirePermissions("patient.view")
  listAlerts(@Param("id") id: string) {
    return this.patientsService.listAlerts(id);
  }

  @Patch(":id/alerts/:alertId/acknowledge")
  @RequirePermissions("patient.view")
  acknowledgeAlert(
    @Param("id") id: string,
    @Param("alertId") alertId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.patientsService.acknowledgeAlert(id, alertId, actor);
  }

  @Post(":id/alerts")
  @RequirePermissions("patient.alert.manage")
  createAlert(
    @Param("id") id: string,
    @Body() dto: CreateAlertDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.patientsService.createAlert(id, dto, actor);
  }

  @Patch(":id/alerts/:alertId/resolve")
  @RequirePermissions("patient.alert.manage")
  resolveAlert(
    @Param("id") id: string,
    @Param("alertId") alertId: string,
    @Body() dto: ResolveAlertDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.patientsService.resolveAlert(id, alertId, actor, dto.reason);
  }
}
