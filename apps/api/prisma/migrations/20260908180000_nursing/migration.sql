-- AlterTable
ALTER TABLE "users" DROP COLUMN "pin",
ADD COLUMN     "pinHash" TEXT;

-- CreateTable
CREATE TABLE "nursing_assignments" (
    "id" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nurseId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nursing_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nursing_assignment_patients" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nursing_assignment_patients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nursing_assignments_nurseId_date_idx" ON "nursing_assignments"("nurseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "nursing_assignments_wardId_shiftId_date_nurseId_key" ON "nursing_assignments"("wardId", "shiftId", "date", "nurseId");

-- CreateIndex
CREATE UNIQUE INDEX "nursing_assignment_patients_patientId_wardId_shiftId_date_key" ON "nursing_assignment_patients"("patientId", "wardId", "shiftId", "date");

-- AddForeignKey
ALTER TABLE "nursing_assignments" ADD CONSTRAINT "nursing_assignments_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nursing_assignments" ADD CONSTRAINT "nursing_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nursing_assignments" ADD CONSTRAINT "nursing_assignments_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nursing_assignments" ADD CONSTRAINT "nursing_assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nursing_assignment_patients" ADD CONSTRAINT "nursing_assignment_patients_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "nursing_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nursing_assignment_patients" ADD CONSTRAINT "nursing_assignment_patients_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

