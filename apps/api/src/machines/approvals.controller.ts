import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { MachinesService } from "./machines.service";
import { RequestApprovalDto } from "./dto/request-approval.dto";
import { DecideApprovalDto } from "./dto/decide-approval.dto";

@Controller("approvals")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(private readonly machinesService: MachinesService) {}

  @Post("machine-usage")
  @RequirePermissions("machine.assign")
  request(@Body() dto: RequestApprovalDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.machinesService.requestApproval(dto, actor);
  }

  @Get()
  @RequireAnyPermission("machine.assign", "approval.machine.decide")
  list(@Query("decision") decision?: "PENDING" | "APPROVED" | "REJECTED") {
    return this.machinesService.listApprovals(decision);
  }

  @Post(":id/decision")
  @RequirePermissions("approval.machine.decide")
  decide(
    @Param("id") id: string,
    @Body() dto: DecideApprovalDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.machinesService.decideApproval(id, dto, actor);
  }
}
