-- CreateEnum
CREATE TYPE "DoctorOrderType" AS ENUM ('MEDICATION', 'LAB_REQUEST', 'NURSING_INSTRUCTION', 'DRY_WEIGHT_CHANGE', 'EXTRA_SESSION_REQUEST', 'PHARMACY_RECOMMENDATION');

-- CreateEnum
CREATE TYPE "DoctorOrderStatus" AS ENUM ('ACTIVE', 'MODIFIED', 'STOPPED');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ACTIVE', 'DISPENSING', 'DISPENSED', 'MODIFIED', 'STOPPED');

-- CreateTable
CREATE TABLE "doctor_orders" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "type" "DoctorOrderType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DoctorOrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "previousOrderId" TEXT,
    "reason" TEXT,
    "prescriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT,
    "linkedSessionId" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "previousPrescriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_administrations" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "administeredById" TEXT NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doseGiven" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_administrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_notes" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "sessionId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_orders_patientId_createdAt_idx" ON "doctor_orders"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_previousPrescriptionId_key" ON "prescriptions"("previousPrescriptionId");

-- CreateIndex
CREATE INDEX "medication_administrations_prescriptionId_idx" ON "medication_administrations"("prescriptionId");

-- CreateIndex
CREATE INDEX "clinical_notes_patientId_createdAt_idx" ON "clinical_notes"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "doctor_orders" ADD CONSTRAINT "doctor_orders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_orders" ADD CONSTRAINT "doctor_orders_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_orders" ADD CONSTRAINT "doctor_orders_previousOrderId_fkey" FOREIGN KEY ("previousOrderId") REFERENCES "doctor_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_orders" ADD CONSTRAINT "doctor_orders_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_linkedSessionId_fkey" FOREIGN KEY ("linkedSessionId") REFERENCES "dialysis_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_previousPrescriptionId_fkey" FOREIGN KEY ("previousPrescriptionId") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_administeredById_fkey" FOREIGN KEY ("administeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dialysis_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dialysis_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

