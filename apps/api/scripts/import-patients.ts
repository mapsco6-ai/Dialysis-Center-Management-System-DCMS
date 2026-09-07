// Bulk-registers patients from a CSV file (docs/PROJECT-PHASES-PLAN.md Phase 1:
// "سكربت استيراد جماعي (CSV/Excel) لتسجيل الـ520 مريضاً دفعة واحدة").
//
// Usage: npm run import:patients --workspace=@dcms/api -- ./path/to/patients.csv
//
// Expected header row (order doesn't matter, extra columns are ignored):
//   fullName,gender,dateOfBirth,phone,address,fileNumber,dialysisStartDate,vascularAccessType,dryWeight,allergies,medicalNotes
import * as fs from "fs";
import { Gender, PrismaClient, VascularAccessType } from "@prisma/client";
import { formatPatientCode, generateBarcode } from "../src/patients/patient-code.util";

const prisma = new PrismaClient();
const MAX_BARCODE_ATTEMPTS = 5;

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });
    return row;
  });
}

async function createPatientFromRow(row: Record<string, string>, actorId: string) {
  if (!row.fullName || !row.gender || !row.dateOfBirth) {
    throw new Error("Missing required field(s): fullName, gender, dateOfBirth");
  }

  const gender: Gender = row.gender.trim().toUpperCase() === "FEMALE" ? "FEMALE" : "MALE";
  const vascularAccessType = row.vascularAccessType
    ? (row.vascularAccessType.trim().toUpperCase() as VascularAccessType)
    : undefined;

  let created: Awaited<ReturnType<typeof prisma.patient.create>> | undefined;
  for (let attempt = 0; attempt < MAX_BARCODE_ATTEMPTS; attempt++) {
    const barcode = generateBarcode();
    try {
      created = await prisma.patient.create({
        data: {
          barcode,
          patientCode: barcode, // temporary unique placeholder, fixed below
          fullName: row.fullName,
          gender,
          dateOfBirth: new Date(row.dateOfBirth),
          phone: row.phone || undefined,
          address: row.address || undefined,
          fileNumber: row.fileNumber || undefined,
          dialysisStartDate: row.dialysisStartDate ? new Date(row.dialysisStartDate) : undefined,
          dryWeight: row.dryWeight ? Number(row.dryWeight) : undefined,
          vascularAccessType,
          allergies: row.allergies || undefined,
          medicalNotes: row.medicalNotes || undefined,
        },
      });
      break;
    } catch (error: unknown) {
      const isBarcodeConflict =
        error instanceof Object &&
        (error as { code?: string }).code === "P2002" &&
        attempt < MAX_BARCODE_ATTEMPTS - 1;
      if (isBarcodeConflict) continue;
      throw error;
    }
  }
  if (!created) {
    throw new Error("Could not generate a unique barcode after several attempts");
  }

  const patient = await prisma.patient.update({
    where: { id: created.id },
    data: { patientCode: formatPatientCode(created.humanNumber) },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole: "SUPER_ADMIN",
      action: "PATIENT_CREATED",
      entityType: "Patient",
      entityId: patient.id,
      newValue: patient as unknown as object,
      reason: "Bulk import",
    },
  });

  await prisma.patientTimelineEvent.create({
    data: {
      patientId: patient.id,
      type: "PATIENT_REGISTERED",
      payload: { patientCode: patient.patientCode, barcode: patient.barcode, source: "bulk_import" },
      performedById: actorId,
      sourceModule: "patients",
    },
  });

  return patient;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run import:patients -- <path-to-csv>");
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const rows = parseCsv(content);
  console.log(`Read ${rows.length} row(s) from ${filePath}`);

  const actorUsername = process.env.SUPER_ADMIN_USERNAME ?? "admin";
  const actor = await prisma.user.findUniqueOrThrow({ where: { username: actorUsername } });

  let success = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      await createPatientFromRow(rows[i], actor.id);
      success++;
    } catch (error) {
      errors.push({ row: i + 2, message: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(`Imported ${success}/${rows.length} patients.`);
  if (errors.length > 0) {
    console.log(`${errors.length} row(s) failed:`);
    errors.forEach((e) => console.log(`  Row ${e.row}: ${e.message}`));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
