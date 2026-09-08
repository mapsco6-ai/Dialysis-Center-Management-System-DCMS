import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { WardsService } from "./wards.service";
import { CreateWardDto } from "./dto/create-ward.dto";

@Controller("wards")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WardsController {
  constructor(private readonly wardsService: WardsService) {}

  @Post()
  @RequirePermissions("machine.manage")
  create(@Body() dto: CreateWardDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.wardsService.create(dto, actor);
  }

  @Get()
  @RequirePermissions("machine.view")
  findAll() {
    return this.wardsService.findAll();
  }

  @Get(":id/machines")
  @RequirePermissions("machine.view")
  findMachines(@Param("id") id: string) {
    return this.wardsService.findMachines(id);
  }
}
