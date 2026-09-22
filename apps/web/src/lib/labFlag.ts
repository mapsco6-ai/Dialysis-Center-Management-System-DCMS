// Shared by the doctor and lab trend views so a result reads the same flag
// everywhere - reuses the labFlag tone set already defined (but previously
// unused) in StatusBadge.tsx.
export type LabFlag = "NORMAL" | "LOW" | "HIGH" | "CRITICAL_LOW" | "CRITICAL_HIGH";

export function flagFor(value: number, low: number | null, high: number | null, isCritical: boolean): LabFlag {
  if (low != null && value < low) return isCritical ? "CRITICAL_LOW" : "LOW";
  if (high != null && value > high) return isCritical ? "CRITICAL_HIGH" : "HIGH";
  return "NORMAL";
}
