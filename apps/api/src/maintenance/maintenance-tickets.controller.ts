import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { MaintenanceService } from "./maintenance.service";
import { ReportFaultDto } from "./dto/report-fault.dto";
import { AssignTicketDto } from "./dto/assign-ticket.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { CloseTicketDto } from "./dto/close-ticket.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";

@Controller("maintenance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MaintenanceTicketsController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  // "Any operational staff" per docs/MODULES-SPEC.md - deliberately not
  // restricted to the MAINTENANCE role, unlike every action past this point.
  @Post("tickets")
  @RequirePermissions("machine.fault.report")
  @UseInterceptors(FileInterceptor("attachment"))
  reportFault(
    @Body() dto: ReportFaultDto,
    @UploadedFile() attachment: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.maintenanceService.reportFault(
      dto,
      attachment
        ? { buffer: attachment.buffer, originalname: attachment.originalname, mimetype: attachment.mimetype }
        : undefined,
      actor,
    );
  }

  @Get("tickets")
  @RequireAnyPermission("machine.view", "maintenance.manage")
  list(@Query() query: ListTicketsQueryDto) {
    return this.maintenanceService.listTickets(query.status, query.machineId);
  }

  // A maintenance manager assigning a ticket needs the pool of
  // maintenance-capable staff without needing the much broader user.view
  // permission just to populate a dropdown - declared before "tickets/:id"
  // so this literal path always wins.
  @Get("staff")
  @RequirePermissions("maintenance.manage")
  listStaff() {
    return this.maintenanceService.listStaff();
  }

  @Get("tickets/:id")
  @RequireAnyPermission("machine.view", "maintenance.manage")
  findOne(@Param("id") id: string) {
    return this.maintenanceService.findOne(id);
  }

  @Get("tickets/:id/attachment")
  @RequireAnyPermission("machine.view", "maintenance.manage")
  async getAttachment(@Param("id") id: string, @Res() res: Response) {
    const { stream, size, contentType } = await this.maintenanceService.getAttachment(id);
    res.set({ "Content-Type": contentType, "Content-Length": size });
    stream.pipe(res);
  }

  @Post("tickets/:id/assign")
  @RequirePermissions("maintenance.manage")
  assign(@Param("id") id: string, @Body() dto: AssignTicketDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.maintenanceService.assign(id, dto, actor);
  }

  @Post("tickets/:id/status")
  @RequirePermissions("maintenance.manage")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateTicketStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.maintenanceService.updateStatus(id, dto, actor);
  }

  @Post("tickets/:id/close")
  @RequirePermissions("maintenance.manage")
  close(@Param("id") id: string, @Body() dto: CloseTicketDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.maintenanceService.close(id, dto, actor);
  }
}
