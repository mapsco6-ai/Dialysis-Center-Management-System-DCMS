-- CreateEnum
CREATE TYPE "StaffEntryType" AS ENUM ('ACTION_NOTE', 'SHIFT_REPORT', 'PROBLEM', 'COMPLAINT', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "StaffEntryStatus" AS ENUM ('SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplaintSource" AS ENUM ('STAFF', 'PATIENT', 'FAMILY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PatientStatus" ADD VALUE 'ON_HOLD';
ALTER TYPE "PatientStatus" ADD VALUE 'TRANSPLANTED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "department" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "employeeNo" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "licenseNo" TEXT,
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "specialty" TEXT;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "patientId" TEXT,
ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusReason" TEXT;

-- AlterTable
ALTER TABLE "clinical_alerts" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedById" TEXT;

-- CreateTable
CREATE TABLE "staff_entries" (
    "id" TEXT NOT NULL,
    "type" "StaffEntryType" NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'LOW',
    "authorId" TEXT NOT NULL,
    "shiftId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT,
    "sessionId" TEXT,
    "machineId" TEXT,
    "complaintSource" "ComplaintSource",
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "status" "StaffEntryStatus" NOT NULL DEFAULT 'SUBMITTED',
    "assignedToId" TEXT,
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "escalatedIncidentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_entry_status_history" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "fromStatus" "StaffEntryStatus",
    "toStatus" "StaffEntryStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_entry_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_entries_authorId_entryDate_idx" ON "staff_entries"("authorId", "entryDate");

-- CreateIndex
CREATE INDEX "staff_entries_type_status_idx" ON "staff_entries"("type", "status");

-- CreateIndex
CREATE INDEX "staff_entries_patientId_idx" ON "staff_entries"("patientId");

-- CreateIndex
CREATE INDEX "staff_entry_status_history_entryId_changedAt_idx" ON "staff_entry_status_history"("entryId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeNo_key" ON "users"("employeeNo");

-- CreateIndex
CREATE INDEX "audit_logs_patientId_createdAt_idx" ON "audit_logs"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "clinical_alerts" ADD CONSTRAINT "clinical_alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_entries" ADD CONSTRAINT "staff_entries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_entries" ADD CONSTRAINT "staff_entries_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_entry_status_history" ADD CONSTRAINT "staff_entry_status_history_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "staff_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_entry_status_history" ADD CONSTRAINT "staff_entry_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

