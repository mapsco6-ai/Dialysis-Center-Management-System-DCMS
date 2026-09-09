import { Module } from "@nestjs/common";
import { PharmacyModule } from "../pharmacy/pharmacy.module";
import { LabModule } from "../lab/lab.module";
import { InventoryModule } from "../inventory/inventory.module";
import { MaintenanceModule } from "../maintenance/maintenance.module";
import { ReportExportService } from "./report-export.service";
import { PatientReportsService } from "./patient-reports.service";
import { PatientReportsController } from "./patient-reports.controller";
import { DialysisReportsService } from "./dialysis-reports.service";
import { DialysisReportsController } from "./dialysis-reports.controller";
import { MachineReportsService } from "./machine-reports.service";
import { MachineReportsController } from "./machine-reports.controller";
import { OperationalReportsService } from "./operational-reports.service";
import { OperationalReportsController } from "./operational-reports.controller";

// No new entities (docs/MODULES-SPEC.md Phase 13/14: "هذا الفيز استهلاكي
// بالكامل") - every service here reads PrismaService directly or reuses an
// existing module's service; this module exists purely to wire up the
// Reports HTTP surface.
@Module({
  imports: [PharmacyModule, LabModule, InventoryModule, MaintenanceModule],
  controllers: [PatientReportsController, DialysisReportsController, MachineReportsController, OperationalReportsController],
  providers: [ReportExportService, PatientReportsService, DialysisReportsService, MachineReportsService, OperationalReportsService],
})
export class ReportsModule {}
