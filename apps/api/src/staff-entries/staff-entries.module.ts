import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { QualityModule } from "../quality/quality.module";
import { StaffEntriesService } from "./staff-entries.service";
import { StaffEntriesController } from "./staff-entries.controller";

@Module({
  imports: [AuditModule, QualityModule],
  controllers: [StaffEntriesController],
  providers: [StaffEntriesService],
})
export class StaffEntriesModule {}
