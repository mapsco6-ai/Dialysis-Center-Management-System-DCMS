"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

// V1.1 (§2.2): provider-free toast. Any module calls toast.success/error/info
// and the single <Toaster /> mounted in the root layout renders the stack.
// Callers translate the message themselves (t(...)) before pushing it.
export type ToastKind = "success" | "error" | "info";

type ToastItem = { id: number; kind: ToastKind; message: string };

const AUTO_DISMISS_MS = 4000;

let items: ToastItem[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  listeners.forEach((listener) => listener());
}

function push(kind: ToastKind, message: string) {
  const item: ToastItem = { id: nextId++, kind, message };
  items = [...items, item];
  listeners.forEach((listener) => listener());
  setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS);
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
};

export function Toaster() {
  const { t } = useI18n();
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`}>
          <span>{item.message}</span>
          <button type="button" aria-label={t("إغلاق", "Close")} onClick={() => dismiss(item.id)}>×</button>
        </div>
      ))}
    </div>
  );
}