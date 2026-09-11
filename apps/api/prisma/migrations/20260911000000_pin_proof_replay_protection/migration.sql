CREATE TABLE "pin_proof_consumptions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pin_proof_consumptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pin_proof_consumptions_expiresAt_idx" ON "pin_proof_consumptions"("expiresAt");
