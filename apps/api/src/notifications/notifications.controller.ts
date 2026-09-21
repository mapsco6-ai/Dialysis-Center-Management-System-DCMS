import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";
import { Transform } from "class-transformer";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { NotificationsService } from "./notifications.service";

class ListNotificationsQuery {
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === "1")
  @IsBoolean()
  unreadOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

// Everyone reads only their own notifications - no permission needed.
@ApiTags("Notifications")
@ApiBearerAuth("bearer")
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsQuery) {
    return this.service.list(user.id, query);
  }

  @Post("read-all")
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.markAllRead(user.id);
  }

  @Patch(":id/read")
  read(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.markRead(user.id, id);
  }
}
