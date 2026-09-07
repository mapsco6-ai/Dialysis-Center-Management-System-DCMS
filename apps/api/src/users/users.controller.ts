import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { DeactivateUserDto } from "./dto/deactivate-user.dto";

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
  findAll() {
    return this.usersService.findAll();
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
