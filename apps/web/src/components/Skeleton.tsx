// V1.1 (§2.2): loading placeholders shaped like the final content, replacing
// the bare "جاري التحميل..." text. The shimmer animation is automatically
// disabled by the existing data-reduced-motion / prefers-reduced-motion rules
// in globals.css.
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton ${className}`} />;
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div aria-hidden="true" className="skeleton-table">
      <div className="skeleton-row skeleton-row-header">
        {Array.from({ length: columns }, (_, column) => (
          <Skeleton key={column} className="skeleton-cell skeleton-cell-header" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div className="skeleton-row" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className="skeleton-cell" />
          ))}
        </div>
      ))}
    </div>
  );
}