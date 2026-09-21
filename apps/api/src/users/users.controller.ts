import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { DeactivateUserDto } from "./dto/deactivate-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { SetRolesDto } from "./dto/set-roles.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Users")
@ApiBearerAuth("bearer")
@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions("user.create")
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.create(dto, actor);
  }

  @Get()
  @RequirePermissions("user.view")
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(":id")
  @RequirePermissions("user.view")
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(":id")
  @RequirePermissions("user.edit")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.update(id, dto, actor);
  }

  @Put(":id/roles")
  @RequirePermissions("user.edit", "role.manage")
  setRoles(@Param("id") id: string, @Body() dto: SetRolesDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.setRoles(id, dto.roleNames, dto.reason, actor);
  }

  @Post(":id/reset-password")
  @HttpCode(200)
  @RequirePermissions("user.reset_password")
  resetPassword(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.resetPassword(id, actor);
  }

  @Post(":id/reset-pin")
  @HttpCode(200)
  @RequirePermissions("user.reset_password")
  resetPin(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.resetPin(id, actor);
  }

  @Patch(":id/activate")
  @RequirePermissions("user.deactivate")
  activate(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.activate(id, actor);
  }

  @Patch(":id/deactivate")
  @RequirePermissions("user.deactivate")
  deactivate(
    @Param("id") id: string,
    @Body() dto: DeactivateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.deactivate(id, actor, dto.reason);
  }
}
