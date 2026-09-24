"use client";

// One accessible way to show a failed action inline: announced to screen
// readers (role="alert"), readable without color (icon + text), and shaped
// the same on every page instead of a bare red line.
export function ErrorNote({ message, className = "" }: { message: string | null | undefined; className?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-md border border-danger bg-surface-secondary px-3 py-2 text-sm text-danger ${className}`}>
      <span aria-hidden="true" className="font-bold">!</span>
      <span>{message}</span>
    </div>
  );
}
