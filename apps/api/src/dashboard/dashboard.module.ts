import { Module } from "@nestjs/common";
import { MachinesModule } from "../machines/machines.module";
import { InventoryModule } from "../inventory/inventory.module";
import { DashboardService } from "./dashboard.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardGateway } from "./dashboard.gateway";

@Module({
  imports: [MachinesModule, InventoryModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardGateway],
})
export class DashboardModule {}
