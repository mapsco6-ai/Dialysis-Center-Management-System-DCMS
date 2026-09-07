// Barcode format matches docs/PROJECT-PHASES-PLAN.md's example (P-A7KD92):
// no medical information encoded, just an opaque random identifier.
const BARCODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

export function generateBarcode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += BARCODE_CHARS[Math.floor(Math.random() * BARCODE_CHARS.length)];
  }
  return `P-${code}`;
}

export function formatPatientCode(humanNumber: number): string {
  return `P-${String(humanNumber).padStart(6, "0")}`;
}
