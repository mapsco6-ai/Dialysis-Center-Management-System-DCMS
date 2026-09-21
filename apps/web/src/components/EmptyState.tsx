"use client";

// V1.1 (§2.2): an empty or failed state that explains why the list is empty
// and offers the obvious next action, instead of a bare "لا توجد نتائج".
export function EmptyState({
  icon = "∅",
  title,
  description,
  actionLabel,
  onAction,
  tone = "neutral",
}: {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "error";
}) {
  return (
    <div className={`empty-state ${tone === "error" ? "empty-state-error" : ""}`}>
      <span className="empty-state-icon" aria-hidden="true">{icon}</span>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
      {actionLabel && onAction && (
        <button type="button" className="empty-state-action" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}