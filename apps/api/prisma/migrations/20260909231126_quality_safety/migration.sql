-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('ADVERSE_EVENT', 'INFECTION', 'VASCULAR_ACCESS_EVENT', 'HOSPITAL_TRANSFER', 'EMERGENCY_EVENT', 'REPEATED_HYPOTENSION', 'MACHINE_INCIDENT');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLOSED');

-- CreateTable
CREATE TABLE "incident_reports" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "sessionId" TEXT,
    "machineId" TEXT,
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_status_history" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "fromStatus" "IncidentStatus" NOT NULL,
    "toStatus" "IncidentStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_reports_patientId_idx" ON "incident_reports"("patientId");

-- CreateIndex
CREATE INDEX "incident_reports_machineId_idx" ON "incident_reports"("machineId");

-- CreateIndex
CREATE INDEX "incident_reports_sessionId_idx" ON "incident_reports"("sessionId");

-- CreateIndex
CREATE INDEX "incident_reports_type_idx" ON "incident_reports"("type");

-- CreateIndex
CREATE INDEX "incident_reports_severity_idx" ON "incident_reports"("severity");

-- CreateIndex
CREATE INDEX "incident_reports_status_idx" ON "incident_reports"("status");

-- CreateIndex
CREATE INDEX "incident_status_history_incidentId_changedAt_idx" ON "incident_status_history"("incidentId", "changedAt");

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dialysis_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incident_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
