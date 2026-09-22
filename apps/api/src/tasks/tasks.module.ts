import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { TasksService } from "./tasks.service";
import { TasksController } from "./tasks.controller";

@Module({
  imports: [AuditModule],
  controllers: [TasksController],
  providers: [TasksService],
  // CalendarModule reuses listMine() rather than re-deriving the same
  // "assigned to me or my role" query.
  exports: [TasksService],
})
export class TasksModule {}
