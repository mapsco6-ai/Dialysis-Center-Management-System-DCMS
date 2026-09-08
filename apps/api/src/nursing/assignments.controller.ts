import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { AssignmentsService } from "./assignments.service";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";
import { ListAssignmentsQueryDto } from "./dto/list-assignments-query.dto";
import { MyAssignmentsQueryDto } from "./dto/my-assignments-query.dto";

@Controller("nursing")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post("assignments")
  @RequirePermissions("nursing.assign")
  upsert(@Body() dto: CreateAssignmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.assignmentsService.upsert(dto, actor);
  }

  @Get("assignments")
  @RequireAnyPermission("nursing.assign", "nursing.ward.view.all")
  listForWard(@Query() query: ListAssignmentsQueryDto) {
    return this.assignmentsService.listForWard(query.wardId, query.shiftId, query.date);
  }

  // Scoped picker for the assignment form - avoids requiring the broader
  // user.view permission just to see who's an active nurse.
  @Get("nurses")
  @RequirePermissions("nursing.assign")
  listNurseCandidates() {
    return this.assignmentsService.listNurseCandidates();
  }

  // Self-service: any authenticated user can see their own roster - no
  // separate permission needed since it only ever returns the caller's own
  // assignments.
  @Get("my-assignments")
  listMine(@Query() query: MyAssignmentsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.assignmentsService.listMine(actor, query.date);
  }
}
