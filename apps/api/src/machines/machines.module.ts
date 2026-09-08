import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { WardsService } from "./wards.service";
import { WardsController } from "./wards.controller";
import { MachinesService } from "./machines.service";
import { MachinesController } from "./machines.controller";
import { ApprovalsController } from "./approvals.controller";
import { SessionMachineController } from "./session-machine.controller";

@Module({
  imports: [AuditModule],
  controllers: [WardsController, MachinesController, ApprovalsController, SessionMachineController],
  providers: [WardsService, MachinesService],
  exports: [WardsService, MachinesService],
})
export class MachinesModule {}
