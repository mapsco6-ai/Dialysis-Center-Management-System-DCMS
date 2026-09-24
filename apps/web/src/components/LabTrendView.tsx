"use client";

import { useI18n } from "@/lib/i18n";
import { flagFor } from "@/lib/labFlag";
import { LabTrend } from "@/lib/types";
import { LineChart } from "./Charts";
import { StatusBadge } from "./StatusBadge";

// The lab report's trend view: a line against the test's normal range plus a
// High/Low/Critical flag on the latest value, so a rising or falling value is
// visible at a glance instead of read off a bare list of numbers. Falls back
// to the plain list for non-numeric results (e.g. "Positive"/"Negative"),
// which a chart can't represent - never hides that data either way.
export function LabTrendView({ trend, testName }: { trend: LabTrend; testName: string }) {
  const { t, formatDate } = useI18n();
  const { points } = trend;

  if (points.length === 0) {
    return <p className="mt-2 text-xs text-muted">{t("لا توجد نتائج نهائية لهذا التحليل بعد", "No final results for this test yet")}</p>;
  }

  const low = trend.referenceRangeLow != null ? Number(trend.referenceRangeLow) : null;
  const high = trend.referenceRangeHigh != null ? Number(trend.referenceRangeHigh) : null;
  const numericValues = points.map((p) => Number(p.value));
  const allNumeric = numericValues.every((v) => Number.isFinite(v));

  if (!allNumeric) {
    return (
      <ul className="mt-2 space-y-1 text-xs text-muted">
        {points.map((p, i) => (
          <li key={i}>{formatDate(p.date)} — {p.value} ({p.episodeCode})</li>
        ))}
      </ul>
    );
  }

  const latest = points[points.length - 1];
  const latestFlag = flagFor(Number(latest.value), low, high, latest.isCritical);
  const days = points.map((p) => p.date.slice(0, 10));

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>{t("آخر قيمة", "Latest value")}: <strong>{latest.value}{trend.unit ? ` ${trend.unit}` : ""}</strong></span>
        <StatusBadge group="labFlag" value={latestFlag} />
      </div>
      <LineChart
        days={days}
        series={[{ name: testName, color: "var(--accent)", data: points.map((p, i) => ({ day: days[i], count: numericValues[i] })) }]}
        band={low != null && high != null ? { low, high } : undefined}
      />
    </div>
  );
}
