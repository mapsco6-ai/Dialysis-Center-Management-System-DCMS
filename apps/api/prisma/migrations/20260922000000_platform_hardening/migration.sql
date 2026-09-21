-- CreateEnum
CREATE TYPE "AccessRecordStatus" AS ENUM ('ACTIVE', 'REMOVED', 'FAILED');

-- AlterEnum
ALTER TYPE "StockTransferStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "MachineStatus" ADD VALUE 'RETIRED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DialysisEventType" ADD VALUE 'CRAMPS';
ALTER TYPE "DialysisEventType" ADD VALUE 'BLEEDING';
ALTER TYPE "DialysisEventType" ADD VALUE 'CHEST_PAIN';
ALTER TYPE "DialysisEventType" ADD VALUE 'CLOTTING';

-- AlterEnum
ALTER TYPE "PrescriptionStatus" ADD VALUE 'REJECTED_BY_PHARMACY';

-- AlterEnum
ALTER TYPE "LabOrderItemStatus" ADD VALUE 'SAMPLE_REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncidentStatus" ADD VALUE 'ACTION_REQUIRED';
ALTER TYPE "IncidentStatus" ADD VALUE 'ACTION_DONE';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "isRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restrictedReason" TEXT;

-- AlterTable
ALTER TABLE "lab_results" ADD COLUMN     "isCritical" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_seals" (
    "id" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "sealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_seals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_status_history" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromStatus" "DialysisSessionStatus",
    "toStatus" "DialysisSessionStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_records" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "VascularAccessType" NOT NULL,
    "location" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    "status" "AccessRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_seals_auditLogId_key" ON "audit_seals"("auditLogId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_seals_seq_key" ON "audit_seals"("seq");

-- CreateIndex
CREATE INDEX "login_attempts_username_createdAt_idx" ON "login_attempts"("username", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "session_status_history_sessionId_changedAt_idx" ON "session_status_history"("sessionId", "changedAt");

-- CreateIndex
CREATE INDEX "access_records_patientId_placedAt_idx" ON "access_records"("patientId", "placedAt");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_seq_key" ON "audit_logs"("seq");

-- AddForeignKey
ALTER TABLE "audit_seals" ADD CONSTRAINT "audit_seals_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "audit_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_status_history" ADD CONSTRAINT "session_status_history_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dialysis_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_records" ADD CONSTRAINT "access_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_records" ADD CONSTRAINT "access_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One place records every dialysis-session status change, whichever service
-- made it (sessions, machines...). Actor/time context lives in audit_logs.
CREATE OR REPLACE FUNCTION log_session_status_change() RETURNS trigger AS $$
BEGIN
  INSERT INTO "session_status_history" ("id", "sessionId", "fromStatus", "toStatus", "changedAt")
  VALUES (gen_random_uuid()::text, NEW."id", CASE WHEN TG_OP = 'UPDATE' THEN OLD."status" END, NEW."status", now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dialysis_sessions_status_insert AFTER INSERT ON "dialysis_sessions"
  FOR EACH ROW EXECUTE FUNCTION log_session_status_change();
CREATE TRIGGER dialysis_sessions_status_update AFTER UPDATE OF "status" ON "dialysis_sessions"
  FOR EACH ROW WHEN (OLD."status" IS DISTINCT FROM NEW."status") EXECUTE FUNCTION log_session_status_change();

-- Sessions that already exist get their current status as first history row.
INSERT INTO "session_status_history" ("id", "sessionId", "toStatus", "changedAt")
SELECT gen_random_uuid()::text, "id", "status", "updatedAt" FROM "dialysis_sessions";
