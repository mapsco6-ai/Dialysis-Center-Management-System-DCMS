import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { RolesService } from "./roles.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Roles")
@ApiBearerAuth("bearer")
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

  // Same data as /permissions, bucketed by module - the shape a role x
  // permission matrix screen renders directly.
  @Get("permissions/grouped")
  @RequirePermissions("role.manage")
  findPermissionsGrouped() {
    return this.rolesService.findPermissionsGrouped();
  }

  @Post("roles")
  @RequirePermissions("role.manage")
  createRole(@Body() dto: CreateRoleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.rolesService.createRole(dto, actor);
  }

  @Delete("roles/:id")
  @RequirePermissions("role.manage")
  deleteRole(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.rolesService.deleteRole(id, actor);
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
