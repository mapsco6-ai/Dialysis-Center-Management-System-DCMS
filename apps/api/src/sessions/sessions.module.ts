import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MachinesModule } from "../machines/machines.module";
import { SessionsService } from "./sessions.service";
import { SessionsController } from "./sessions.controller";
import { ReadingsController } from "./readings.controller";
import { EventsController } from "./events.controller";

@Module({
  imports: [AuditModule, MachinesModule],
  controllers: [SessionsController, ReadingsController, EventsController],
  providers: [SessionsService],
})
export class SessionsModule {}
