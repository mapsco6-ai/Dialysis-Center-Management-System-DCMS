// Bulk-registers patients from a CSV file (docs/PROJECT-PHASES-PLAN.md Phase 1:
// "سكربت استيراد جماعي (CSV/Excel) لتسجيل الـ520 مريضاً دفعة واحدة").
//
// Usage: npm run import:patients --workspace=@dcms/api -- ./path/to/patients.csv
//
// Expected header row (order doesn't matter, extra columns are ignored):
//   fullName,gender,dateOfBirth,phone,address,fileNumber,dialysisStartDate,vascularAccessType,dryWeight,allergies,medicalNotes
//
// Excel export note: save as "CSV UTF-8 (Comma delimited)" - real .xlsx files
// are not parsed here (docs review DCMS-015); that needs a separate reader.
import "dotenv/config";
import { createPatientAtomically } from "../src/patients/create-patient-atomically";
import * as fs from "fs";
import { Gender, PrismaClient, VascularAccessType } from "@prisma/client";

const prisma = new PrismaClient();
const VALID_VASCULAR_ACCESS_TYPES = new Set<VascularAccessType>(["FISTULA", "CATHETER", "GRAFT"]);

// Single-pass, quote-aware, handles fields containing literal newlines or
// commas (Excel wraps such fields in "..."). The previous version split on
// \n *before* parsing quotes, which silently corrupted any row with a
// multi-line quoted cell (docs review DCMS-015).
function parseCsv(content: string): Record<string, string>[] {
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content; // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // ignore; \n (bare or following \r) ends the row
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0].map((h) => h.trim());
  return nonEmptyRows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] ?? "").trim();
    });
    return record;
  });
}

async function createPatientFromRow(row: Record<string, string>, actorId: string) {
  if (!row.fullName || !row.gender || !row.dateOfBirth) {
    throw new Error("Missing required field(s): fullName, gender, dateOfBirth");
  }

  const genderInput = row.gender.trim().toUpperCase();
  if (genderInput !== "MALE" && genderInput !== "FEMALE") {
    // No silent default: an unrecognized value used to become MALE, which
    // corrupts data without anyone noticing (docs review DCMS-015).
    throw new Error(`Unrecognized gender value "${row.gender}" - expected MALE or FEMALE`);
  }
  const gender = genderInput as Gender;

  let vascularAccessType: VascularAccessType | undefined;
  if (row.vascularAccessType) {
    const value = row.vascularAccessType.trim().toUpperCase() as VascularAccessType;
    if (!VALID_VASCULAR_ACCESS_TYPES.has(value)) {
      throw new Error(`Unrecognized vascularAccessType "${row.vascularAccessType}"`);
    }
    vascularAccessType = value;
  }

  const dateOfBirth = new Date(row.dateOfBirth);
  if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.getTime() > Date.now()) {
    throw new Error(`Invalid or future dateOfBirth "${row.dateOfBirth}"`);
  }

  const dryWeight = row.dryWeight ? Number(row.dryWeight) : undefined;
  if (dryWeight !== undefined && (Number.isNaN(dryWeight) || dryWeight <= 0 || dryWeight > 300)) {
    throw new Error(`Invalid dryWeight "${row.dryWeight}"`);
  }

  // Soft duplicate guard: skip rather than silently create a second chart for
  // the same person on a retried/re-run import (docs review DCMS-005 partial
  // mitigation - fileNumber is deliberately NOT a DB unique constraint, since
  // its real-world uniqueness scope hasn't been confirmed with the center).
  if (row.fileNumber) {
    const existing = await prisma.patient.findFirst({ where: { fileNumber: row.fileNumber } });
    if (existing) {
      throw new Error(`Skipped: fileNumber "${row.fileNumber}" already belongs to ${existing.patientCode}`);
    }
  }

  return createPatientAtomically(prisma, {
    fullName: row.fullName,
    gender,
    dateOfBirth,
    phone: row.phone || undefined,
    address: row.address || undefined,
    fileNumber: row.fileNumber || undefined,
    dialysisStartDate: row.dialysisStartDate ? new Date(row.dialysisStartDate) : undefined,
    dryWeight,
    vascularAccessType,
    allergies: row.allergies || undefined,
    medicalNotes: row.medicalNotes || undefined,
  }, async (tx, patient) => {
    await tx.auditLog.create({
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

    await tx.patientTimelineEvent.create({
      data: {
        patientId: patient.id,
        type: "PATIENT_REGISTERED",
        payload: { patientCode: patient.patientCode, barcode: patient.barcode, source: "bulk_import" },
        performedById: actorId,
        sourceModule: "patients",
      },
    });

  });
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

  // A partial failure must be visible to whatever invokes this script (CI,
  // an operator's shell, a future scheduled job) - it used to always exit 0
  // even when every single row failed (docs review DCMS-015).
  if (errors.length > 0) {
    process.exitCode = 1;
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
