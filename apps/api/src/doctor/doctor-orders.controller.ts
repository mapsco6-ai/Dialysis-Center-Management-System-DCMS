import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { DoctorOrdersService } from "./doctor-orders.service";
import { CreateDoctorOrderDto } from "./dto/create-doctor-order.dto";
import { StopDoctorOrderDto } from "./dto/stop-doctor-order.dto";
import { ModifyDoctorOrderDto } from "./dto/modify-doctor-order.dto";
import { ListDoctorOrdersQueryDto } from "./dto/list-doctor-orders-query.dto";

@Controller("doctor-orders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DoctorOrdersController {
  constructor(private readonly doctorOrdersService: DoctorOrdersService) {}

  @Post()
  @RequirePermissions("prescription.create")
  create(@Body() dto: CreateDoctorOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.doctorOrdersService.create(dto, actor);
  }

  @Get()
  @RequirePermissions("patient.view")
  listForPatient(@Query() query: ListDoctorOrdersQueryDto) {
    return this.doctorOrdersService.listForPatient(query.patientId);
  }

  @Post(":id/stop")
  @RequirePermissions("prescription.modify")
  stop(@Param("id") id: string, @Body() dto: StopDoctorOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.doctorOrdersService.stop(id, dto, actor);
  }

  @Post(":id/modify")
  @RequirePermissions("prescription.modify")
  modify(@Param("id") id: string, @Body() dto: ModifyDoctorOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.doctorOrdersService.modify(id, dto, actor);
  }
}
