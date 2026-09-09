-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "relatedPrescriptionId" TEXT;

-- CreateTable
CREATE TABLE "prescription_dispenses" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "dispensedById" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "linkedSessionId" TEXT,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_dispenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prescription_dispenses_prescriptionId_idx" ON "prescription_dispenses"("prescriptionId");

-- CreateIndex
CREATE INDEX "stock_movements_relatedPrescriptionId_idx" ON "stock_movements"("relatedPrescriptionId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_relatedPrescriptionId_fkey" FOREIGN KEY ("relatedPrescriptionId") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_dispenses" ADD CONSTRAINT "prescription_dispenses_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_dispenses" ADD CONSTRAINT "prescription_dispenses_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_dispenses" ADD CONSTRAINT "prescription_dispenses_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_dispenses" ADD CONSTRAINT "prescription_dispenses_linkedSessionId_fkey" FOREIGN KEY ("linkedSessionId") REFERENCES "dialysis_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

