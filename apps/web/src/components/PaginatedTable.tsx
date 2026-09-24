"use client";

import { useI18n } from "@/lib/i18n";
import { EmptyState } from "./EmptyState";
import { SkeletonTable } from "./Skeleton";

// V1.1 (§2.2 + §11.3): the one paginated table every list uses, so 1000+ rows
// never load as a whole collection into the DOM. Server returns
// { data, total }; the footer shows "من X إلى Y من N" with a bounded page
// window. Rows stay visible (dimmed) while a new page loads so the table
// doesn't flash empty.
export type TableColumn<T> = {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
};

type PaginatedTableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[] | null;
  total: number | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription?: string;
  hidePagination?: boolean;
  rowKey?: (row: T, index: number) => string;
};

function pageWindow(current: number, count: number): (number | "ellipsis")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const candidates = [1, count, current - 1, current, current + 1]
    .filter((p) => p >= 1 && p <= count);
  const unique = [...new Set(candidates)].sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  unique.forEach((p, i) => {
    if (i > 0 && p - unique[i - 1] > 1) out.push("ellipsis");
    out.push(p);
  });
  return out;
}

export function PaginatedTable<T>({
  columns,
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  hidePagination = false,
  rowKey,
}: PaginatedTableProps<T>) {
  const { t, formatNumber } = useI18n();
  const pageCount = total && total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const from = rows && rows.length > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = rows ? (page - 1) * pageSize + rows.length : 0;
  const pages = pageWindow(page, pageCount);
  const showBody = !loading || Boolean(rows);
  const showEmpty = !loading && !error && rows !== null && rows.length === 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-start text-sm">
        <thead className="bg-surface-secondary text-muted">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-2 font-medium">{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className={loading && rows ? "opacity-60" : undefined}>
          {loading && !rows && (
            <tr>
              <td colSpan={columns.length} className="p-0">
                <SkeletonTable rows={5} columns={columns.length} />
              </td>
            </tr>
          )}
          {showBody && error && (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState tone="error" icon="!" title={t("تعذر تحميل البيانات", "Unable to load data")}
                  description={error} actionLabel={onRetry ? t("إعادة المحاولة", "Retry") : undefined} onAction={onRetry} />
              </td>
            </tr>
          )}
          {showEmpty && (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </td>
            </tr>
          )}
          {showBody && !error && rows && rows.length > 0 && rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row, index) : index} className="border-t border-border hover:bg-surface-secondary">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-2 text-foreground">
                  {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!hidePagination && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted">
          <span>
            {formatNumber(from)}–{formatNumber(to)} / {formatNumber(total ?? 0)}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" className="pagination-button" disabled={page <= 1}
              aria-label={t("الصفحة السابقة", "Previous page")} onClick={() => onPageChange(page - 1)}>‹</button>
            {pages.map((p, i) => p === "ellipsis" ? (
              <span key={`ellipsis-${i}`} className="px-1">…</span>
            ) : (
              <button key={p} type="button" aria-current={p === page ? "page" : undefined}
                className={`pagination-button ${p === page ? "is-current" : ""}`}
                onClick={() => { if (p !== page) onPageChange(p); }}>
                {formatNumber(p)}
              </button>
            ))}
            <button type="button" className="pagination-button" disabled={page >= pageCount}
              aria-label={t("الصفحة التالية", "Next page")} onClick={() => onPageChange(page + 1)}>›</button>
          </div>
        </div>
      )}
    </div>
  );
}