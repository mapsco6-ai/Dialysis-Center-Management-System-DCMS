import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LabModule } from "../lab/lab.module";
import { DoctorOrdersService } from "./doctor-orders.service";
import { DoctorOrdersController } from "./doctor-orders.controller";
import { PrescriptionsService } from "./prescriptions.service";
import { PrescriptionsController } from "./prescriptions.controller";
import { ClinicalNotesService } from "./clinical-notes.service";
import { ClinicalNotesController } from "./clinical-notes.controller";

@Module({
  imports: [AuditModule, LabModule],
  controllers: [DoctorOrdersController, PrescriptionsController, ClinicalNotesController],
  providers: [DoctorOrdersService, PrescriptionsService, ClinicalNotesService],
})
export class DoctorModule {}
