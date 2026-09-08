-- CreateEnum
CREATE TYPE "ShiftName" AS ENUM ('SHIFT_1', 'SHIFT_2', 'SHIFT_3', 'SHIFT_4');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('SCHEDULED', 'ARRIVED', 'LATE', 'ABSENT', 'CANCELLED', 'EXTRA', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('REGULAR', 'EXTRA', 'EMERGENCY');

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "name" "ShiftName" NOT NULL,
    "dialysisStart" TEXT NOT NULL,
    "dialysisEnd" TEXT NOT NULL,
    "cleaningStart" TEXT NOT NULL,
    "cleaningEnd" TEXT NOT NULL,
    "nominalCapacity" INTEGER NOT NULL DEFAULT 0,
    "reservedCapacity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialysis_plans" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "shiftId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dialysis_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialysis_schedules" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "planId" TEXT,
    "scheduledDate" DATE NOT NULL,
    "shiftId" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "type" "ScheduleType" NOT NULL DEFAULT 'REGULAR',
    "extraReason" TEXT,
    "requestedByDoctorId" TEXT,
    "emergencySourceHospital" TEXT,
    "emergencyReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dialysis_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shifts_name_key" ON "shifts"("name");

-- CreateIndex
CREATE INDEX "dialysis_plans_patientId_idx" ON "dialysis_plans"("patientId");

-- CreateIndex
CREATE INDEX "dialysis_schedules_scheduledDate_idx" ON "dialysis_schedules"("scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "dialysis_schedules_patientId_scheduledDate_shiftId_key" ON "dialysis_schedules"("patientId", "scheduledDate", "shiftId");

-- AddForeignKey
ALTER TABLE "dialysis_plans" ADD CONSTRAINT "dialysis_plans_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_plans" ADD CONSTRAINT "dialysis_plans_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_schedules" ADD CONSTRAINT "dialysis_schedules_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_schedules" ADD CONSTRAINT "dialysis_schedules_planId_fkey" FOREIGN KEY ("planId") REFERENCES "dialysis_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_schedules" ADD CONSTRAINT "dialysis_schedules_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_schedules" ADD CONSTRAINT "dialysis_schedules_requestedByDoctorId_fkey" FOREIGN KEY ("requestedByDoctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
