"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import { useNotificationEvents } from "@/lib/useLiveEvents";

const LABELS: Record<string, [string, string]> = {
  unreadNotifications: ["إشعارات غير مقروءة", "Unread notifications"],
  myOpenEntries: ["تقاريري قيد المتابعة", "My open reports"],
  entriesToReview: ["تقارير بانتظار المراجعة", "Reports to review"],
  prescriptionsToDispense: ["وصفات بانتظار الصرف", "Prescriptions to dispense"],
  labItemsPending: ["فحوصات قيد الإنجاز", "Lab tests pending"],
  openMaintenanceTickets: ["بلاغات صيانة مفتوحة", "Open maintenance tickets"],
  transfersAwaitingApproval: ["تحويلات بانتظار الموافقة", "Transfers awaiting approval"],
  openIncidents: ["حوادث مفتوحة", "Open incidents"],
  patientsToCheckIn: ["مرضى اليوم بانتظار الحضور", "Patients still to check in today"],
  myOpenTasks: ["مهامي المفتوحة", "My open tasks"],
  openTasksToManage: ["مهام مفتوحة (كل الموظفين)", "Open tasks (all staff)"],
};

// "What is waiting for me" - only the items this role can act on.
export function WorkQueue() {
  const { t, formatNumber } = useI18n();
  const queue = useApi<{ items: { key: string; count: number; link: string }[] }>("/me/work-queue");
  useNotificationEvents(queue.refresh);

  const items = queue.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-label={t("عملي الآن", "My work")} className="mt-4">
      <h2 className="text-sm font-semibold text-slate-600">{t("عملي الآن", "My work")}</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {items.map((item) => {
          const [ar, en] = LABELS[item.key] ?? [item.key, item.key];
          return (
            <Link key={item.key} href={item.link} className={`rounded-lg border p-3 hover:bg-slate-50 ${item.count > 0 ? "border-slate-300 bg-white" : "border-slate-200 bg-white text-slate-400"}`}>
              <span className="block text-2xl font-semibold">{formatNumber(item.count)}</span>
              <span className="text-xs text-slate-500">{t(ar, en)}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
