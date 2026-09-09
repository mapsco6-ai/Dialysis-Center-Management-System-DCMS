import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { InventoryItemsService } from "./inventory-items.service";
import { InventoryItemsController } from "./inventory-items.controller";
import { PatientSupplyProfileService } from "./patient-supply-profile.service";
import { PatientSupplyProfileController } from "./patient-supply-profile.controller";
import { SessionSuppliesService } from "./session-supplies.service";
import { SessionSuppliesController } from "./session-supplies.controller";
import { InventoryBatchesService } from "./inventory-batches.service";
import { InventoryBatchesController } from "./inventory-batches.controller";
import { StockTransfersService } from "./stock-transfers.service";
import { StockTransfersController } from "./stock-transfers.controller";
import { WarehouseAnalyticsService } from "./warehouse-analytics.service";
import { WarehouseAnalyticsController } from "./warehouse-analytics.controller";

@Module({
  imports: [AuditModule],
  controllers: [
    InventoryItemsController,
    PatientSupplyProfileController,
    SessionSuppliesController,
    InventoryBatchesController,
    StockTransfersController,
    WarehouseAnalyticsController,
  ],
  providers: [
    InventoryItemsService,
    PatientSupplyProfileService,
    SessionSuppliesService,
    InventoryBatchesService,
    StockTransfersService,
    WarehouseAnalyticsService,
  ],
  exports: [InventoryItemsService, PatientSupplyProfileService, SessionSuppliesService, InventoryBatchesService],
})
export class InventoryModule {}
