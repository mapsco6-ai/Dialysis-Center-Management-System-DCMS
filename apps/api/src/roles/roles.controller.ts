import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { RolesService } from "./roles.service";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get("roles")
  @RequirePermissions("role.manage")
  findAllRoles() {
    return this.rolesService.findAll();
  }

  @Get("permissions")
  @RequirePermissions("role.manage")
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Patch("roles/:id/permissions")
  @RequirePermissions("permission.manage")
  updateRolePermissions(
    @Param("id") id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rolesService.updateRolePermissions(id, dto.permissionKeys, actor);
  }
}
