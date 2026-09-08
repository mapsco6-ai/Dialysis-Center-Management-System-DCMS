import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { MachineStatus } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { MachinesService } from "./machines.service";
import { CreateMachineDto } from "./dto/create-machine.dto";
import { UpdateMachineStatusDto } from "./dto/update-machine-status.dto";

@Controller("machines")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Post()
  @RequirePermissions("machine.manage")
  create(@Body() dto: CreateMachineDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.machinesService.create(dto, actor);
  }

  @Get()
  @RequirePermissions("machine.view")
  findAll(@Query("status") status?: MachineStatus) {
    return this.machinesService.findAll(status);
  }

  @Get("capacity")
  @RequirePermissions("machine.view")
  getCapacity() {
    return this.machinesService.getCapacitySnapshot();
  }

  @Get(":id")
  @RequirePermissions("machine.view")
  findOne(@Param("id") id: string) {
    return this.machinesService.findOne(id);
  }

  // POST (not PATCH) to match docs/PROJECT-PHASES-PLAN.md's literal endpoint.
  @Post(":id/status")
  @RequirePermissions("machine.manage")
  setStatus(
    @Param("id") id: string,
    @Body() dto: UpdateMachineStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.machinesService.setStatus(id, dto, actor);
  }
}
