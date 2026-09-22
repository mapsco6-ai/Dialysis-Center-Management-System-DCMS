"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/components/Toaster";
import { MyCalendar, Task, TaskStatus } from "@/lib/types";

function toLocalDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function weekDates(start: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const NEXT_TASK_STATUS: Partial<Record<TaskStatus, TaskStatus>> = { OPEN: "IN_PROGRESS", IN_PROGRESS: "DONE" };

export default function MyCalendarPage() {
  const { t, formatDate } = useI18n();
  const user = useCurrentUser();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const days = weekDates(weekStart);
  const from = toLocalDateInputValue(days[0]);
  const to = toLocalDateInputValue(days[6]);
  const { data, loading, refresh } = useApi<MyCalendar>(user ? `/me/calendar?from=${from}&to=${to}` : null);

  async function advanceTask(task: Task) {
    const next = NEXT_TASK_STATUS[task.status];
    if (!next) return;
    try {
      await apiFetch(`/tasks/${task.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("تعذر تحديث المهمة", "Unable to update the task"));
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const dayKey = (d: Date) => toLocalDateInputValue(d);
  const tasksWithoutDate = (data?.tasks ?? []).filter((task) => !task.dueAt);

  return (
    <AdminShell user={user}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{t("تقويمي", "My calendar")}</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            {t("هذا الأسبوع", "This week")}
          </button>
          <button onClick={() => setWeekStart((prev) => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">‹</button>
          <button onClick={() => setWeekStart((prev) => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">›</button>
        </div>
      </div>

      {tasksWithoutDate.length > 0 && (
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("مهام بدون موعد محدد", "Tasks with no due date")}</h2>
          <ul className="space-y-1">
            {tasksWithoutDate.map((task) => <TaskRow key={task.id} task={task} onAdvance={advanceTask} />)}
          </ul>
        </section>
      )}

      {loading && <p className="mt-6 text-sm text-slate-400">{t("جاري التحميل...", "Loading...")}</p>}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((d) => {
          const key = dayKey(d);
          const shifts = (data?.shifts ?? []).filter((s) => toLocalDateInputValue(new Date(s.date)) === key);
          const appointments = (data?.appointments ?? []).filter((a) => toLocalDateInputValue(new Date(a.date)) === key);
          const tasks = (data?.tasks ?? []).filter((task) => task.dueAt && toLocalDateInputValue(new Date(task.dueAt)) === key);
          const isToday = key === toLocalDateInputValue(new Date());
          return (
            <div key={key} className={`rounded-lg border bg-white p-2 ${isToday ? "border-slate-400" : "border-slate-200"}`}>
              <p className="mb-2 text-xs font-semibold text-slate-600">{formatDate(d, { weekday: "short", day: "numeric", month: "short" })}</p>

              {shifts.map((s) => (
                <div key={s.id} className="mb-1 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                  {s.ward.name} · {s.shift.dialysisStart}–{s.shift.dialysisEnd}
                </div>
              ))}

              {tasks.map((task) => <TaskRow key={task.id} task={task} onAdvance={advanceTask} compact />)}

              {appointments.map((a, i) => (
                <Link key={i} href={`/admin/care/patients/${a.patient.id}`} className="mb-1 flex items-center justify-between rounded px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50">
                  <span>{a.patient.fullName}</span>
                  {a.status && <StatusBadge group="schedule" value={a.status} />}
                </Link>
              ))}

              {shifts.length === 0 && tasks.length === 0 && appointments.length === 0 && (
                <p className="text-[11px] text-slate-300">{t("لا شيء", "Nothing")}</p>
              )}
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}

function TaskRow({ task, onAdvance, compact }: { task: Task; onAdvance: (task: Task) => void; compact?: boolean }) {
  const { t } = useI18n();
  const next = NEXT_TASK_STATUS[task.status];
  return (
    <div className={`mb-1 rounded border border-slate-100 px-2 py-1 ${compact ? "text-[11px]" : "text-xs"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-700">{task.title}</span>
        <StatusBadge group="task" value={task.status} />
      </div>
      <p className="text-slate-400">
        {task.assignedTo ? t("مسندة إليك", "Assigned to you") : t(`لكل ${task.assignedToRole?.name}`, `Routed to ${task.assignedToRole?.name}`)}
        {task.patient ? ` · ${task.patient.fullName}` : ""}
      </p>
      {next && (
        <button onClick={() => onAdvance(task)} className="mt-1 text-[11px] font-medium text-slate-600 hover:underline">
          {next === "IN_PROGRESS" ? t("بدء العمل", "Start") : t("إنهاء", "Mark done")}
        </button>
      )}
    </div>
  );
}
