-- AlterEnum
ALTER TYPE "ScheduleStatus" ADD VALUE 'RESCHEDULED';

-- AlterEnum
ALTER TYPE "ApprovalDecision" ADD VALUE 'EXPIRED';

-- AlterEnum
ALTER TYPE "MaintenanceTicketStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "dialysis_schedules" ADD COLUMN     "rescheduledToId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "dialysis_schedules_rescheduledToId_key" ON "dialysis_schedules"("rescheduledToId");

