"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useNotificationEvents, type SocketNotification } from "@/lib/useLiveEvents";
import { Button, Description, Dropdown, Header, Label } from "@heroui/react";
import { WorkspaceIcon } from "./WorkspaceIcon";

type Notification = SocketNotification;

// Bell in the top bar. History comes from REST. A socket push inserts the row
// immediately; a later list response keeps any push the request missed.
export function NotificationBell() {
  const { t, formatDate, formatNumber } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const itemsRef = useRef<Notification[]>([]);
  const seen = useRef(new Set<string>());

  const load = useCallback(() => {
    apiFetch("/notifications?limit=10")
      .then((r: { data: Notification[]; unread: number }) => {
        const extra = itemsRef.current.filter((p) => !r.data.some((d) => d.id === p.id));
        const next = [...extra, ...r.data].slice(0, 10);
        itemsRef.current = next;
        next.forEach((n) => seen.current.add(n.id));
        setItems(next);
        setUnread(r.unread + extra.filter((p) => !p.readAt).length);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useNotificationEvents((n) => {
    if (!n?.id || seen.current.has(n.id)) return;
    seen.current.add(n.id);
    const next = [n, ...itemsRef.current].slice(0, 10);
    itemsRef.current = next;
    setItems(next);
    if (!n.readAt) setUnread((count) => count + 1);
  });

  async function openItem(n: Notification) {
    if (!n.readAt) await apiFetch(`/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => undefined);
    load();
    if (n.link) router.push(n.link);
  }

  async function readAll() {
    await apiFetch("/notifications/read-all", { method: "POST" }).catch(() => undefined);
    load();
  }

  return (
    <Dropdown>
      <Button variant="secondary" size="sm" isIconOnly
        aria-label={t(`الإشعارات (${unread} غير مقروء)`, `Notifications (${unread} unread)`)}
        className="relative min-w-0">
        <WorkspaceIcon name="bell" width={16} height={16} />
        {unread > 0 && <span className="pointer-events-none absolute -end-1 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : formatNumber(unread)}</span>}
      </Button>
      <Dropdown.Popover placement="bottom end" className="w-80 max-w-[90vw]">
        <Dropdown.Menu onAction={(key) => {
          if (key === "read-all") { readAll(); return; }
          const item = items.find((n) => n.id === key);
          if (item) openItem(item);
        }}>
          <Dropdown.Section>
            <Header>{t("الإشعارات", "Notifications")}</Header>
            {unread > 0 && (
              <Dropdown.Item id="read-all" textValue={t("تعليم الكل كمقروء", "Mark all read")}>
                <Label>{t("تعليم الكل كمقروء", "Mark all read")}</Label>
              </Dropdown.Item>
            )}
            {items.length === 0 && (
              <Dropdown.Item id="empty" textValue={t("لا توجد إشعارات", "No notifications")} isDisabled>
                <Label>{t("لا توجد إشعارات", "No notifications")}</Label>
              </Dropdown.Item>
            )}
            {items.map((n) => (
              <Dropdown.Item key={n.id} id={n.id} textValue={n.title} className={n.readAt ? "text-muted" : "font-medium"}>
                <div className="flex min-w-0 flex-col">
                  <Label>{n.title}</Label>
                  {n.body && <Description className="truncate">{n.body}</Description>}
                  <span className="text-[10px] font-normal text-muted">{formatDate(n.createdAt, { dateStyle: "short", timeStyle: "short" })}</span>
                </div>
              </Dropdown.Item>
            ))}
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
