-- CreateEnum
CREATE TYPE "StockLocationType" AS ENUM ('MAIN_WAREHOUSE', 'PHARMACY', 'LABORATORY_STOCK', 'WARD_STOCK');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ISSUE', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SupplyIssueStatus" AS ENUM ('ISSUED', 'UNAVAILABLE', 'SUBSTITUTED');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "barcode" TEXT,
    "minimumStock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "requiresBatchTracking" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" TEXT NOT NULL,
    "type" "StockLocationType" NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "reason" TEXT,
    "relatedScheduleId" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_supply_profiles" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "defaultQuantity" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_supply_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_supply_overrides" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "overrideQuantity" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_supply_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_supply_issue_items" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityRequested" DECIMAL(10,2) NOT NULL,
    "quantityIssued" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "SupplyIssueStatus" NOT NULL,
    "substituteForItemId" TEXT,
    "reason" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_supply_issue_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_barcode_key" ON "inventory_items"("barcode");

-- CreateIndex
CREATE INDEX "inventory_items_category_idx" ON "inventory_items"("category");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_type_key" ON "stock_locations"("type");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_itemId_locationId_key" ON "stock_balances"("itemId", "locationId");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_idx" ON "stock_movements"("itemId");

-- CreateIndex
CREATE INDEX "stock_movements_relatedScheduleId_idx" ON "stock_movements"("relatedScheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_supply_profiles_patientId_itemId_key" ON "patient_supply_profiles"("patientId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "session_supply_overrides_scheduleId_itemId_key" ON "session_supply_overrides"("scheduleId", "itemId");

-- CreateIndex
CREATE INDEX "session_supply_issue_items_scheduleId_idx" ON "session_supply_issue_items"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "session_supply_issue_items_scheduleId_itemId_key" ON "session_supply_issue_items"("scheduleId", "itemId");

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_relatedScheduleId_fkey" FOREIGN KEY ("relatedScheduleId") REFERENCES "dialysis_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_supply_profiles" ADD CONSTRAINT "patient_supply_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_supply_profiles" ADD CONSTRAINT "patient_supply_profiles_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_supply_overrides" ADD CONSTRAINT "session_supply_overrides_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "dialysis_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_supply_overrides" ADD CONSTRAINT "session_supply_overrides_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_supply_overrides" ADD CONSTRAINT "session_supply_overrides_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_supply_issue_items" ADD CONSTRAINT "session_supply_issue_items_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "dialysis_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_supply_issue_items" ADD CONSTRAINT "session_supply_issue_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_supply_issue_items" ADD CONSTRAINT "session_supply_issue_items_substituteForItemId_fkey" FOREIGN KEY ("substituteForItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_supply_issue_items" ADD CONSTRAINT "session_supply_issue_items_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
