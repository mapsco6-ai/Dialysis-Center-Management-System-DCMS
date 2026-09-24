"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { FilterSelect } from "@/components/FilterSelect";
import { ErrorNote } from "@/components/ErrorNote";
import { toast } from "@/components/Toaster";
import { MyCalendar, Task, TaskPriority, TaskStatus } from "@/lib/types";

function toLocalDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const NEXT_TASK_STATUS: Partial<Record<TaskStatus, TaskStatus>> = { OPEN: "IN_PROGRESS", IN_PROGRESS: "DONE" };
const PRIORITY_TONE: Record<TaskPriority, string> = { URGENT: "tone-urgent", HIGH: "tone-high", NORMAL: "tone-task", LOW: "tone-low" };
const VISIBLE_PER_DAY = 3;

type CalendarEntry = {
  key: string;
  tone: string;
  label: string;
  time: string;
  title: string;
  href?: string;
  onClick?: () => void;
  done?: boolean;
};

export default function MyCalendarPage() {
  const { t, formatDate } = useI18n();
  const user = useCurrentUser();
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [status, setStatus] = useState<"ALL" | TaskStatus>("ALL");
  const [priority, setPriority] = useState<"ALL" | TaskPriority>("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // A month view shows whole weeks, so the range runs from the Sunday before
  // the 1st to the Saturday after the last day - entries in the greyed-out
  // leading and trailing cells are real and must be fetched too.
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = view === "month" ? startOfWeek(monthStart) : startOfWeek(anchor);
  const dayCount = view === "month" ? 42 : 7;
  const days = Array.from({ length: dayCount }, (_, i) => addDays(gridStart, i));
  const from = toLocalDateInputValue(days[0]);
  const to = toLocalDateInputValue(days[days.length - 1]);
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
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const todayKey = toLocalDateInputValue(new Date());
  const keepTask = (task: Task) =>
    (status === "ALL" || task.status === status) && (priority === "ALL" || task.priority === priority);

  function entriesFor(day: Date): CalendarEntry[] {
    const key = toLocalDateInputValue(day);
    const shifts = (data?.shifts ?? [])
      .filter((s) => toLocalDateInputValue(new Date(s.date)) === key)
      .map<CalendarEntry>((s) => ({
        key: `shift-${s.id}`,
        tone: "tone-shift",
        label: s.ward.name,
        time: s.shift.dialysisStart,
        title: `${s.ward.name} · ${s.shift.dialysisStart}–${s.shift.dialysisEnd}`,
      }));
    const tasks = (data?.tasks ?? [])
      .filter((task) => task.dueAt && toLocalDateInputValue(new Date(task.dueAt)) === key)
      .filter(keepTask)
      .map<CalendarEntry>((task) => ({
        key: `task-${task.id}`,
        tone: PRIORITY_TONE[task.priority],
        label: task.title,
        time: formatDate(task.dueAt as string, { hour: "2-digit", minute: "2-digit" }),
        title: `${task.title}${task.patient ? ` · ${task.patient.fullName}` : ""}`,
        done: task.status === "DONE" || task.status === "CANCELLED",
        onClick: NEXT_TASK_STATUS[task.status] ? () => advanceTask(task) : undefined,
      }));
    const appointments = (data?.appointments ?? [])
      .filter((a) => toLocalDateInputValue(new Date(a.date)) === key)
      .map<CalendarEntry>((a, i) => ({
        key: `appt-${key}-${i}`,
        tone: "tone-appointment",
        label: a.patient.fullName,
        time: a.shift.dialysisStart,
        title: `${a.patient.fullName} · ${a.patient.patientCode}`,
        href: `/admin/care/patients/${a.patient.id}`,
      }));
    return [...shifts, ...tasks, ...appointments].sort((a, b) => a.time.localeCompare(b.time));
  }

  const undated = (data?.tasks ?? []).filter((task) => !task.dueAt).filter(keepTask);
  const periodLabel = view === "month"
    ? formatDate(monthStart, { month: "long", year: "numeric" })
    : `${formatDate(days[0], { day: "numeric", month: "short" })} – ${formatDate(days[6], { day: "numeric", month: "short", year: "numeric" })}`;

  function shift(direction: 1 | -1) {
    setAnchor((prev) => (view === "month"
      ? new Date(prev.getFullYear(), prev.getMonth() + direction, 1)
      : addDays(prev, 7 * direction)));
  }

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{t("تقويمي", "My calendar")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("مناوباتك ومهامك ومواعيد مرضاك في مكان واحد.", "Your shifts, tasks, and patient appointments in one place.")}
          </p>
        </div>
        {user.permissions.includes("task.create") && (
          <button onClick={() => setAdding((v) => !v)} className="bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
            {adding ? t("إلغاء", "Cancel") : t("+ مهمة جديدة", "+ Add task")}
          </button>
        )}
      </div>

      {adding && <AddTaskForm userId={user.id} onDone={() => { setAdding(false); refresh(); }} />}

      <div className="mt-5 cal-toolbar">
        <div className="cal-period">
          <div className="cal-monthchip" aria-hidden="true">
            <b>{formatDate(anchor, { month: "short" })}</b>
            <span>{anchor.getDate()}</span>
          </div>
          <div>
            <p className="cal-period-title">{periodLabel}</p>
            <p className="cal-period-range">
              {formatDate(days[0], { dateStyle: "medium" })} – {formatDate(days[days.length - 1], { dateStyle: "medium" })}
            </p>
          </div>
        </div>

        <div className="cal-tools">
          <div className="cal-nav">
            <button onClick={() => shift(-1)} aria-label={t("السابق", "Previous")}><Arrow dir="start" /></button>
            <button onClick={() => setAnchor(new Date())}>{t("اليوم", "Today")}</button>
            <button onClick={() => shift(1)} aria-label={t("التالي", "Next")}><Arrow dir="end" /></button>
          </div>
          <FilterSelect
            className="cal-filter-select"
            aria-label={t("طريقة العرض", "View")}
            value={view}
            onChange={(id) => setView(id as "month" | "week")}
            options={[
              { id: "month", label: t("عرض شهري", "Month view") },
              { id: "week", label: t("عرض أسبوعي", "Week view") },
            ]}
          />
          <FilterSelect
            className="cal-filter-select"
            aria-label={t("الحالة", "Status")}
            value={status}
            onChange={(id) => setStatus(id as "ALL" | TaskStatus)}
            options={[
              { id: "ALL", label: t("كل الحالات", "All statuses") },
              { id: "OPEN", label: t("مفتوحة", "Open") },
              { id: "IN_PROGRESS", label: t("قيد التنفيذ", "In progress") },
              { id: "DONE", label: t("منجزة", "Done") },
            ]}
          />
          <FilterSelect
            className="cal-filter-select"
            aria-label={t("الأولوية", "Priority")}
            value={priority}
            onChange={(id) => setPriority(id as "ALL" | TaskPriority)}
            options={[
              { id: "ALL", label: t("كل الأولويات", "All priorities") },
              { id: "URGENT", label: t("عاجلة", "Urgent") },
              { id: "HIGH", label: t("عالية", "High") },
              { id: "NORMAL", label: t("عادية", "Normal") },
              { id: "LOW", label: t("منخفضة", "Low") },
            ]}
          />
        </div>
      </div>

      {loading && <p className="mt-4 text-sm text-muted">{t("جاري التحميل...", "Loading...")}</p>}

      <div className="cal-sheet">
        <div className="cal-grid">
          {days.slice(0, 7).map((day) => (
            <div key={`head-${day.getDay()}`} className="cal-head">{formatDate(day, { weekday: "short" })}</div>
          ))}
          {days.map((day) => {
            const key = toLocalDateInputValue(day);
            const entries = entriesFor(day);
            const isOpen = expanded === key;
            const shown = isOpen ? entries : entries.slice(0, VISIBLE_PER_DAY);
            const outside = view === "month" && day.getMonth() !== anchor.getMonth();
            return (
              <div key={key} className={`cal-cell${outside ? " is-outside" : ""}`}>
                <span className={`cal-daynum${key === todayKey ? " is-today" : ""}`}>{day.getDate()}</span>
                {shown.map((entry) => <CalendarEvent key={entry.key} entry={entry} />)}
                {entries.length > VISIBLE_PER_DAY && (
                  <button className="cal-more" onClick={() => setExpanded(isOpen ? null : key)}>
                    {isOpen ? t("عرض أقل", "Show less") : `+${entries.length - VISIBLE_PER_DAY} ${t("أخرى", "more")}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <section className="mt-5 rounded-lg border border-border bg-surface p-4">
          <h2>{t("مهام بدون موعد محدد", "Tasks with no due date")}</h2>
          <div className="mt-3 grid gap-1">
            {undated.map((task) => (
              <CalendarEvent
                key={task.id}
                entry={{
                  key: task.id,
                  tone: PRIORITY_TONE[task.priority],
                  label: task.title,
                  time: "",
                  title: task.title,
                  done: task.status === "DONE" || task.status === "CANCELLED",
                  onClick: NEXT_TASK_STATUS[task.status] ? () => advanceTask(task) : undefined,
                }}
              />
            ))}
          </div>
        </section>
      )}
    </AdminShell>
  );
}

function Arrow({ dir }: { dir: "start" | "end" }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === "start" ? <path d="M19 12H5M12 19l-7-7 7-7" /> : <path d="M5 12h14M12 5l7 7-7 7" />}
    </svg>
  );
}

function CalendarEvent({ entry }: { entry: CalendarEntry }) {
  const className = `cal-event ${entry.tone}${entry.done ? " is-done" : ""}`;
  const body = (
    <>
      <span className="cal-event-label">{entry.label}</span>
      {entry.time && <span className="cal-event-time">{entry.time}</span>}
    </>
  );
  if (entry.href) {
    return <Link href={entry.href} className={className} title={entry.title}>{body}</Link>;
  }
  // Entries with nothing to do on click stay non-interactive rather than
  // becoming a button that silently does nothing.
  if (!entry.onClick) {
    return <span className={className} title={entry.title} style={{ cursor: "default" }}>{body}</span>;
  }
  return <button type="button" className={className} title={entry.title} onClick={entry.onClick}>{body}</button>;
}

function AddTaskForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const dueAt = String(form.get("dueAt") ?? "");
    try {
      await apiFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          assignedToId: userId,
          priority: form.get("priority"),
          // The API takes a full ISO timestamp; a date input only gives a day.
          ...(dueAt ? { dueAt: new Date(`${dueAt}T09:00`).toISOString() } : {}),
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر إنشاء المهمة", "Unable to create the task"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h2>{t("مهمة جديدة لي", "New task for me")}</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium">
          {t("العنوان", "Title")}
          <input name="title" required autoFocus className="border border-border" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t("التاريخ", "Due date")}
          <input type="date" name="dueAt" className="border border-border" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t("الأولوية", "Priority")}
          <select name="priority" defaultValue="NORMAL" className="border border-border">
            <option value="URGENT">{t("عاجلة", "Urgent")}</option>
            <option value="HIGH">{t("عالية", "High")}</option>
            <option value="NORMAL">{t("عادية", "Normal")}</option>
            <option value="LOW">{t("منخفضة", "Low")}</option>
          </select>
        </label>
        <button type="submit" disabled={saving} className="bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
          {saving ? t("جاري الحفظ...", "Saving...") : t("حفظ", "Save")}
        </button>
      </div>
      <ErrorNote message={error} />
    </form>
  );
}
