-- AlterTable
ALTER TABLE "dialysis_schedules" ADD COLUMN     "absentMarkedAt" TIMESTAMP(3),
ADD COLUMN     "checkInByUserId" TEXT,
ADD COLUMN     "checkInStationId" TEXT,
ADD COLUMN     "checkInTime" TIMESTAMP(3),
ADD COLUMN     "lateMinutes" INTEGER;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "lateThresholdMinutes" INTEGER NOT NULL DEFAULT 30;

-- AddForeignKey
ALTER TABLE "dialysis_schedules" ADD CONSTRAINT "dialysis_schedules_checkInByUserId_fkey" FOREIGN KEY ("checkInByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
