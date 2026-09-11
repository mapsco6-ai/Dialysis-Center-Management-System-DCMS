import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SessionSuppliesService } from "./session-supplies.service";
import { SetSessionOverrideDto } from "./dto/set-session-override.dto";
import { SubstituteSupplyDto } from "./dto/substitute-supply.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Inventory - Session Supplies")
@ApiBearerAuth("bearer")
@Controller("sessions/:id/supplies")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionSuppliesController {
  constructor(private readonly sessionSuppliesService: SessionSuppliesService) {}

  @Get()
  @RequirePermissions("inventory.view")
  get(@Param("id") id: string) {
    return this.sessionSuppliesService.getSessionSupplies(id);
  }

  @Patch("override")
  @RequirePermissions("inventory.issue")
  setOverride(
    @Param("id") id: string,
    @Body() dto: SetSessionOverrideDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sessionSuppliesService.setOverride(id, dto, actor);
  }

  @Post("confirm-issue")
  @RequirePermissions("inventory.issue")
  confirmIssue(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.sessionSuppliesService.confirmIssue(id, actor);
  }

  @Post("substitute")
  @RequirePermissions("inventory.issue")
  substitute(
    @Param("id") id: string,
    @Body() dto: SubstituteSupplyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sessionSuppliesService.substitute(id, dto, actor);
  }
}
