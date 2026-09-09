import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MachinesModule } from "../machines/machines.module";
import { StorageModule } from "../storage/storage.module";
import { MaintenanceService } from "./maintenance.service";
import { MaintenanceTicketsController } from "./maintenance-tickets.controller";
import { MachineTimelineController } from "./machine-timeline.controller";

@Module({
  imports: [AuditModule, MachinesModule, StorageModule],
  controllers: [MaintenanceTicketsController, MachineTimelineController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
