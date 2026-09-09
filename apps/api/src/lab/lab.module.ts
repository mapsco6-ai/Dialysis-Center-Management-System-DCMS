import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LabCatalogService } from "./lab-catalog.service";
import { LabCatalogController } from "./lab-catalog.controller";
import { LabOrdersService } from "./lab-orders.service";
import { LabOrdersController } from "./lab-orders.controller";
import { LabResultsService } from "./lab-results.service";
import { LabResultsController } from "./lab-results.controller";
import { LabTrendController } from "./lab-trend.controller";

@Module({
  imports: [AuditModule],
  controllers: [LabCatalogController, LabOrdersController, LabResultsController, LabTrendController],
  providers: [LabCatalogService, LabOrdersService, LabResultsService],
  // DoctorModule creates a pending-specification LabOrder shell when a
  // LAB_REQUEST comes through the generic order path (DCMS-061).
  exports: [LabOrdersService],
})
export class LabModule {}
