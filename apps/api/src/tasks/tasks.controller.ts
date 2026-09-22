import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { ListTasksQueryDto } from "./dto/list-tasks-query.dto";

@ApiTags("Tasks")
@ApiBearerAuth("bearer")
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post("tasks")
  @RequirePermissions("task.create")
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.create(dto, user);
  }

  // Someone routing a task to a role needs the id/name pairs to populate a
  // dropdown, without needing the much broader role.manage permission just to
  // see the role list (same reasoning as MaintenanceService.listStaff()).
  @Get("tasks/routable-roles")
  @RequirePermissions("task.create")
  listRoutableRoles() {
    return this.tasksService.listRoutableRoles();
  }

  @Get("tasks")
  @RequirePermissions("task.manage")
  list(@Query() query: ListTasksQueryDto) {
    return this.tasksService.list(query);
  }

  // Own inbox: no permission beyond being logged in, same as
  // /nursing/my-assignments and /staff-entries/mine.
  @Get("me/tasks")
  listMine(@Query("from") from: string | undefined, @Query("to") to: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.listMine(user, from, to);
  }

  @Patch("tasks/:id/status")
  updateStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTaskStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.updateStatus(id, dto, user);
  }
}
