import { BadRequestException } from "@nestjs/common";
import { Patient, Prisma, PrismaClient } from "@prisma/client";
import { generateBarcode, formatPatientCode } from "./patient-code.util";
import { isUniqueConstraintOn } from "./prisma-errors.util";

// A unique violation aborts a PostgreSQL transaction: retry the entire
// transaction, never an insert inside an already-aborted transaction.
// No compensating DELETE is needed (or permitted by the runtime DB role).
export async function createPatientAtomically(
  prisma: PrismaClient,
  data: Omit<Prisma.PatientCreateInput, "barcode" | "patientCode">,
  finalize: (tx: Prisma.TransactionClient, patient: Patient) => Promise<void>,
): Promise<Patient> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const barcode = generateBarcode();
        const created = await tx.patient.create({ data: { ...data, barcode, patientCode: barcode } });
        const patient = await tx.patient.update({
          where: { id: created.id },
          data: { patientCode: formatPatientCode(created.humanNumber) },
        });
        await finalize(tx, patient);
        return patient;
      });
    } catch (error) {
      const collision = isUniqueConstraintOn(error, "barcode") || isUniqueConstraintOn(error, "patientCode");
      if (!collision || attempt === 4) throw error;
    }
  }
  throw new BadRequestException("Could not generate a unique barcode");
}
