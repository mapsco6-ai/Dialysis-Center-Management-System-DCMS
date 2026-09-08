-- CreateEnum
CREATE TYPE "DialysisSessionStatus" AS ENUM ('PRE_DIALYSIS', 'SUPPLIES_READY', 'WAITING_MACHINE', 'ASSIGNED', 'IN_DIALYSIS', 'POST_DIALYSIS', 'COMPLETED', 'DISCHARGED', 'INTERRUPTED');

-- CreateEnum
CREATE TYPE "DialysisEventType" AS ENUM ('NORMAL', 'HYPOTENSION', 'ACCESS_ISSUE', 'MACHINE_ISSUE', 'MEDICATION_GIVEN', 'PHYSICIAN_CALLED', 'SESSION_INTERRUPTED', 'OTHER');

-- CreateTable
CREATE TABLE "dialysis_sessions" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "machineId" TEXT,
    "wardId" TEXT,
    "nurseId" TEXT,
    "status" "DialysisSessionStatus" NOT NULL DEFAULT 'PRE_DIALYSIS',
    "preWeight" DECIMAL(5,2),
    "preBP" TEXT,
    "prePulse" INTEGER,
    "preTemperature" DECIMAL(4,1),
    "preGlucose" DECIMAL(6,2),
    "dryWeight" DECIMAL(5,2),
    "preNotes" TEXT,
    "dialyzerType" TEXT,
    "bloodLineType" TEXT,
    "prescribedDurationMinutes" INTEGER,
    "requiredUF" DECIMAL(6,2),
    "accessInfo" JSONB,
    "startTime" TIMESTAMP(3),
    "postWeight" DECIMAL(5,2),
    "postBP" TEXT,
    "postPulse" INTEGER,
    "actualUF" DECIMAL(6,2),
    "actualDurationMinutes" INTEGER,
    "complications" TEXT,
    "finalNote" TEXT,
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dialysis_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialysis_readings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bp" TEXT,
    "pulse" INTEGER,
    "arterialPressure" DECIMAL(6,2),
    "venousPressure" DECIMAL(6,2),
    "tmp" DECIMAL(6,2),
    "bloodFlow" DECIMAL(6,2),
    "uf" DECIMAL(6,2),
    "enteredById" TEXT NOT NULL,
    "amendedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dialysis_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialysis_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "DialysisEventType" NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dialysis_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dialysis_sessions_scheduleId_key" ON "dialysis_sessions"("scheduleId");

-- CreateIndex
CREATE INDEX "dialysis_readings_sessionId_time_idx" ON "dialysis_readings"("sessionId", "time");

-- CreateIndex
CREATE INDEX "dialysis_events_sessionId_recordedAt_idx" ON "dialysis_events"("sessionId", "recordedAt");

-- AddForeignKey
ALTER TABLE "dialysis_sessions" ADD CONSTRAINT "dialysis_sessions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "dialysis_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_sessions" ADD CONSTRAINT "dialysis_sessions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_sessions" ADD CONSTRAINT "dialysis_sessions_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_sessions" ADD CONSTRAINT "dialysis_sessions_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_sessions" ADD CONSTRAINT "dialysis_sessions_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_readings" ADD CONSTRAINT "dialysis_readings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dialysis_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_readings" ADD CONSTRAINT "dialysis_readings_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_readings" ADD CONSTRAINT "dialysis_readings_amendedFromId_fkey" FOREIGN KEY ("amendedFromId") REFERENCES "dialysis_readings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_events" ADD CONSTRAINT "dialysis_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dialysis_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialysis_events" ADD CONSTRAINT "dialysis_events_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
