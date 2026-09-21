"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useNotificationEvents } from "@/lib/useLiveEvents";

interface Notification { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

// Bell in the top bar: unread badge, latest notifications, click to open the
// related screen. Refreshes when the server pushes a notification, and every
// minute as a fallback if the socket is down.
export function NotificationBell() {
  const { t, formatDate, formatNumber } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    apiFetch("/notifications?limit=10")
      .then((r: { data: Notification[]; unread: number }) => { setItems(r.data); setUnread(r.unread); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);
  useNotificationEvents(load);

  async function openItem(n: Notification) {
    setOpen(false);
    if (!n.readAt) await apiFetch(`/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => undefined);
    load();
    if (n.link) router.push(n.link);
  }

  async function readAll() {
    await apiFetch("/notifications/read-all", { method: "POST" }).catch(() => undefined);
    load();
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
        aria-label={t(`الإشعارات (${unread} غير مقروء)`, `Notifications (${unread} unread)`)}
        className="relative rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50">
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : formatNumber(unread)}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-30 mt-2 w-80 max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <strong className="text-sm">{t("الإشعارات", "Notifications")}</strong>
            {unread > 0 && <button type="button" onClick={readAll} className="text-xs text-slate-500 underline">{t("تعليم الكل كمقروء", "Mark all read")}</button>}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">{t("لا توجد إشعارات", "No notifications")}</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" role="menuitem" onClick={() => openItem(n)} className={`block w-full px-3 py-2 text-start text-sm hover:bg-slate-50 ${n.readAt ? "text-slate-500" : "font-medium text-slate-800"}`}>
                  {n.title}
                  {n.body && <span className="block truncate text-xs font-normal text-slate-500">{n.body}</span>}
                  <span className="block text-[10px] font-normal text-slate-400">{formatDate(n.createdAt, { dateStyle: "short", timeStyle: "short" })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
