"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { useI18n } from "@/lib/i18n";

// Small dependency-free SVG/HTML charts for the committee dashboard. Colors
// come from the .viz-root CSS variables (validated palette, own dark steps);
// text always uses text tokens, never the series color. Every chart is
// hoverable, keyboard-reachable where clickable, and has a table view.

export type Tally = { key: string; count: number }[];
export type DayPoint = { day: string; count: number };
export type TableData = { headers: string[]; rows: (string | number)[][] };

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function ChartCard({ title, table, children }: { title: string; table: TableData; children: React.ReactNode }) {
  const { t, formatNumber } = useI18n();
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="viz-root rounded-lg border border-border bg-surface p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Button size="sm" variant={asTable ? "primary" : "secondary"} aria-pressed={asTable} onPress={() => setAsTable(!asTable)}>
          {asTable ? t("رسم", "Chart") : t("جدول", "Table")}
        </Button>
      </div>
      <div className="mt-3">
        {asTable ? (
          <table className="w-full text-start text-xs">
            <thead className="text-muted"><tr>{table.headers.map((h) => <th key={h} className="py-1 pe-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((row, i) => <tr key={i} className="border-t border-border">{row.map((cell, j) => <td key={j} className="py-1 pe-2 text-foreground">{typeof cell === "number" ? formatNumber(cell) : cell}</td>)}</tr>)}</tbody>
          </table>
        ) : children}
      </div>
    </section>
  );
}

// Horizontal bars for a categorical tally. Clicking a bar (when onSelect is
// given) cross-filters the rest of the page.
export function BarList({ data, label, onSelect, selected }: { data: Tally; label: (key: string) => string; onSelect?: (key: string | null) => void; selected?: string | null }) {
  const { t, formatNumber } = useI18n();
  const [hover, setHover] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));
  if (data.length === 0) return <p className="py-6 text-center text-xs text-muted">{t("لا توجد بيانات في هذه الفترة", "No data in this period")}</p>;
  const active = data.find((d) => d.key === hover);
  return (
    <div>
      <p className="h-4 text-xs text-muted" aria-live="polite">
        {active ? `${label(active.key)} — ${formatNumber(active.count)} (${formatNumber(Math.round((active.count / total) * 100))}%)` : ""}
      </p>
      {data.map((d) => {
        const clickable = Boolean(onSelect);
        return (
          <div key={d.key} className={`viz-bar-row ${selected === d.key ? "is-selected" : ""}`}
            role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined} aria-pressed={clickable ? selected === d.key : undefined}
            onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(d.key)} onBlur={() => setHover(null)}
            onClick={() => onSelect?.(selected === d.key ? null : d.key)}
            onKeyDown={(e) => { if (clickable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect?.(selected === d.key ? null : d.key); } }}>
            <span className="truncate text-foreground">{label(d.key)}</span>
            <span className="viz-bar-track"><span className="viz-bar-fill block" style={{ width: `${(d.count / max) * 100}%` }} /></span>
            <span className="text-end text-foreground">{formatNumber(d.count)}</span>
          </div>
        );
      })}
    </div>
  );
}

const W = 640, H = 220, PAD = { l: 34, r: 12, t: 12, b: 24 };

export type Series = { name: string; color: string; data: DayPoint[] };

// Multi-series daily line chart with a crosshair + tooltip. All series share
// one y axis (never dual-axis) and the same day list, missing days = 0.
// `band` draws a translucent normal-range rectangle behind the grid (lab
// trend's reference range) - values are on the same scale as `series`.
export function LineChart({ days, series, onSelectDay, band }: { days: string[]; series: Series[]; onSelectDay?: (day: string) => void; band?: { low: number; high: number } }) {
  const { t, formatNumber, formatDate } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const values = series.map((s) => days.map((d) => s.data.find((p) => p.day === d)?.count ?? 0));
  const max = Math.max(1, band?.high ?? 0, ...values.flat());
  const x = (i: number) => PAD.l + (days.length <= 1 ? 0 : (i / (days.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const ticks = [0, Math.ceil(max / 2), max];
  const step = (W - PAD.l - PAD.r) / Math.max(1, days.length - 1);
  return (
    <div className="relative">
      <div className="viz-legend mb-1">{series.map((s) => <span key={s.name}><span className="viz-swatch" style={{ background: s.color }} />{s.name}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => s.name).join(", ")} onMouseLeave={() => setHover(null)}>
        {band && (
          <rect x={PAD.l} y={y(band.high)} width={W - PAD.l - PAD.r} height={Math.max(0, y(band.low) - y(band.high))} fill="var(--viz-grid)" />
        )}
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(tk)} y2={y(tk)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(tk) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">{formatNumber(tk)}</text>
          </g>
        ))}
        {[0, Math.floor((days.length - 1) / 2), days.length - 1].filter((v, i, a) => days.length > 0 && a.indexOf(v) === i).map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">{days[i].slice(5)}</text>
        ))}
        {series.map((s, si) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            points={values[si].map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--viz-grid)" strokeWidth={1} />
            {series.map((s, si) => <circle key={s.name} cx={x(hover)} cy={y(values[si][hover])} r={4} fill={s.color} stroke="var(--viz-ring)" strokeWidth={2} />)}
          </g>
        )}
        {days.map((d, i) => (
          <rect key={d} x={x(i) - step / 2} y={PAD.t} width={Math.max(step, 4)} height={H - PAD.t - PAD.b} fill="transparent"
            style={{ cursor: onSelectDay ? "pointer" : "default" }} onMouseEnter={() => setHover(i)} onClick={() => onSelectDay?.(d)} />
        ))}
      </svg>
      {hover !== null && (
        <div className="viz-tooltip" style={{ insetInlineStart: `${(x(hover) / W) * 100}%`, top: 24, transform: "translateX(-50%)" }}>
          <div className="font-medium">{formatDate(days[hover], { dateStyle: "medium" })}</div>
          {series.map((s, si) => <div key={s.name}><span className="viz-swatch" style={{ background: s.color }} />{s.name}: {formatNumber(values[si][hover])}</div>)}
          {onSelectDay && <div className="text-muted">{t("انقر لتصفية هذا اليوم", "Click to filter this day")}</div>}
        </div>
      )}
    </div>
  );
}

export function daysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(12, 0, 0, 0);
  const end = new Date(to);
  while (cursor <= end && out.length < 120) {
    out.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
