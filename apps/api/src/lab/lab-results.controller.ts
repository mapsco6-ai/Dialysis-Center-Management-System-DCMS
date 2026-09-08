import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { LabResultsService } from "./lab-results.service";
import { UpdateItemStatusDto } from "./dto/update-item-status.dto";
import { EnterResultDto } from "./dto/enter-result.dto";
import { AmendResultDto } from "./dto/amend-result.dto";

@Controller("lab/order-items/:id")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabResultsController {
  constructor(private readonly labResultsService: LabResultsService) {}

  @Post("status")
  @RequirePermissions("lab.result.create")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateItemStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.labResultsService.updateStatus(id, dto, actor);
  }

  @Post("results")
  @RequirePermissions("lab.result.create")
  enterResult(@Param("id") id: string, @Body() dto: EnterResultDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.labResultsService.enterResult(id, dto, actor);
  }

  @Post("amend-result")
  @RequirePermissions("lab.result.create")
  amendResult(@Param("id") id: string, @Body() dto: AmendResultDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.labResultsService.amendResult(id, dto, actor);
  }
}
