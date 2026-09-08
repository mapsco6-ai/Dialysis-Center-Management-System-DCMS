import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { LabOrdersService } from "./lab-orders.service";
import { CreateLabOrderDto } from "./dto/create-lab-order.dto";
import { ListLabOrdersQueryDto } from "./dto/list-lab-orders-query.dto";
import { ListQueueQueryDto } from "./dto/list-queue-query.dto";

@Controller("lab")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabOrdersController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  @Post("orders")
  @RequirePermissions("lab.request")
  create(@Body() dto: CreateLabOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.labOrdersService.create(dto, actor);
  }

  @Get("orders")
  @RequirePermissions("patient.view")
  listForPatient(@Query() query: ListLabOrdersQueryDto) {
    return this.labOrdersService.listForPatient(query.patientId);
  }

  @Get("queue")
  @RequirePermissions("lab.queue.view")
  listQueue(@Query() query: ListQueueQueryDto) {
    return this.labOrdersService.listQueue(query.status);
  }
}
