"use client";

import { CSSProperties, FormEvent, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { FilterSelect } from "@/components/FilterSelect";
import { ErrorNote } from "@/components/ErrorNote";
import { toast } from "@/components/Toaster";
import { CalendarAppointment, CalendarItem, MyCalendar, Shift, Task, TaskPriority, TaskStatus } from "@/lib/types";

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
const ITEM_HREF: Record<CalendarItem["kind"], string> = {
  LAB_DRAW: "/admin/care/lab",
  LAB_PENDING: "/admin/care/lab",
  LAB_REVIEW: "/admin/care/doctor",
  DISPENSE: "/admin/care/pharmacy",
  MAINTENANCE: "/admin/facility/maintenance",
  COVERAGE: "/admin/care/nursing",
};

// Session progress wins over the reception status once a session exists.
function appointmentTone(a: CalendarAppointment) {
  if (a.sessionStatus === "IN_DIALYSIS") return "tone-live";
  if (a.sessionStatus === "INTERRUPTED" || a.status === "EMERGENCY") return "tone-urgent";
  if (a.sessionStatus || a.status === "ARRIVED") return "tone-arrived";
  if (a.status === "LATE") return "tone-high";
  return "tone-appointment";
}
const FINISHED = ["POST_DIALYSIS", "COMPLETED", "DISCHARGED", "ABSENT", "CANCELLED", "RESCHEDULED"];
const VISIBLE_PER_DAY = 3;
const VISIBLE_PER_WEEK_DAY = 10;

type CalendarEntry = {
  key: string;
  day: string;
  shiftId?: string;
  tone: string;
  label: string;
  time: string;
  title: string;
  href?: string;
  onClick?: () => void;
  done?: boolean;
  flag?: boolean;
};

type Slot = { day: string; shift: Shift; ward?: string; patients: number };

export default function MyCalendarPage() {
  const { t, formatDate } = useI18n();
  const user = useCurrentUser();
  const [view, setView] = useState<"month" | "week">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [status, setStatus] = useState<"ALL" | TaskStatus>("ALL");
  const [priority, setPriority] = useState<"ALL" | TaskPriority>("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Always fetch the anchor's whole month grid (Sunday before the 1st to the
  // Saturday after the last day): the mini calendar needs every day's dots,
  // and the anchor's week always falls inside that grid.
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthDays = Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(monthStart), i));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  const days = view === "month" ? monthDays : weekDays;
  const from = toLocalDateInputValue(monthDays[0]);
  const to = toLocalDateInputValue(monthDays[41]);
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

  const shiftLabel: Record<Shift["name"], string> = {
    SHIFT_1: t("الشفت الأول", "Shift 1"),
    SHIFT_2: t("الشفت الثاني", "Shift 2"),
    SHIFT_3: t("الشفت الثالث", "Shift 3"),
    SHIFT_4: t("الشفت الرابع", "Shift 4"),
  };
  const now = new Date();
  const todayKey = toLocalDateInputValue(now);
  const dayOf = (iso: string) => toLocalDateInputValue(new Date(iso));
  const itemLabel: Record<CalendarItem["kind"], string> = {
    LAB_DRAW: t("سحب عينة", "Sample draw"),
    LAB_PENDING: t("نتيجة معلقة", "Result pending"),
    LAB_REVIEW: t("نتائج للمراجعة", "Results to review"),
    DISPENSE: t("صرف دواء", "Dispense"),
    MAINTENANCE: t("صيانة", "Maintenance"),
    COVERAGE: t("تغطية التمريض", "Nurse coverage"),
  };
  const keepTask = (task: Task) =>
    (status === "ALL" || task.status === status) && (priority === "ALL" || task.priority === priority);
  const taskEntry = (task: Task) => ({
    tone: PRIORITY_TONE[task.priority],
    label: task.title,
    title: `${task.title}${task.patient ? ` · ${task.patient.fullName}` : ""}`,
    done: task.status === "DONE" || task.status === "CANCELLED",
    onClick: NEXT_TASK_STATUS[task.status] ? () => advanceTask(task) : undefined,
  });

  const entries: CalendarEntry[] = [
    ...(data?.shifts ?? []).map((s) => ({
      key: `shift-${s.id}`,
      day: dayOf(s.date),
      shiftId: s.shift.id,
      tone: "tone-shift",
      label: s.ward.name,
      time: s.shift.dialysisStart,
      title: `${s.ward.name} · ${s.shift.dialysisStart}–${s.shift.dialysisEnd}`,
    })),
    ...(data?.tasks ?? []).filter((task) => task.dueAt).filter(keepTask).map((task) => ({
      ...taskEntry(task),
      key: `task-${task.id}`,
      day: dayOf(task.dueAt as string),
      time: formatDate(task.dueAt as string, { hour: "2-digit", minute: "2-digit" }),
    })),
    ...(data?.appointments ?? []).map((a) => ({
      key: `appt-${a.scheduleId}`,
      day: dayOf(a.date),
      shiftId: a.shift.id,
      tone: appointmentTone(a),
      label: a.patient.fullName,
      time: a.shift.dialysisStart,
      flag: a.alertCount > 0,
      title: [
        `${a.patient.fullName} · ${a.patient.patientCode}`,
        a.machineCode && `${t("الجهاز", "Machine")} ${a.machineCode}`,
        a.alertCount > 0 && `${a.alertCount} ${t("تنبيه نشط", "active alerts")}`,
      ].filter(Boolean).join(" · "),
      href: `/admin/care/patients/${a.patient.id}`,
      done: FINISHED.includes(a.sessionStatus ?? a.status),
    })),
    ...(data?.items ?? []).map((item) => ({
      key: `item-${item.id}`,
      day: dayOf(item.date),
      shiftId: item.shiftId ?? undefined,
      tone: item.urgent ? "tone-urgent" : item.kind === "COVERAGE" ? "tone-shift" : "tone-task",
      label: `${itemLabel[item.kind]} · ${item.patient?.fullName ?? item.detail}`,
      time: "",
      title: [itemLabel[item.kind], item.patient?.fullName, item.kind === "COVERAGE" ? `${t("ممرضون/مرضى", "nurses/patients")} ${item.detail}` : item.detail]
        .filter(Boolean).join(" · "),
      href: item.kind === "LAB_REVIEW" && item.patient ? `/admin/care/patients/${item.patient.id}` : ITEM_HREF[item.kind],
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const entriesOn = (key: string) => entries.filter((e) => e.day === key);

  const weekKeys = weekDays.map(toLocalDateInputValue);
  // Only days with something on them; month view skips the neighbouring
  // months' days that pad the grid.
  const shownDays = days.filter((d) =>
    (view === "week" || d.getMonth() === anchor.getMonth()) && entriesOn(toLocalDateInputValue(d)).length > 0);

  // Next up: the first shift slot (own assignment or patient session) that
  // hasn't ended yet. Only meaningful while the loaded month contains today.
  const slots = new Map<string, Slot>();
  for (const s of data?.shifts ?? []) {
    slots.set(`${dayOf(s.date)}|${s.shift.id}`, { day: dayOf(s.date), shift: s.shift, ward: s.ward.name, patients: 0 });
  }
  for (const a of data?.appointments ?? []) {
    const key = `${dayOf(a.date)}|${a.shift.id}`;
    const slot = slots.get(key) ?? { day: dayOf(a.date), shift: a.shift, patients: 0 };
    slot.patients += 1;
    slots.set(key, slot);
  }
  const nextSlot = from <= todayKey && todayKey <= to
    ? [...slots.values()]
        .filter((s) => new Date(`${s.day}T${s.shift.dialysisEnd}`) > now)
        .sort((a, b) => `${a.day}${a.shift.dialysisStart}`.localeCompare(`${b.day}${b.shift.dialysisStart}`))[0]
    : undefined;
  const todayEntries = entriesOn(todayKey);
  const todayPatients = todayEntries.filter((e) => e.key.startsWith("appt-")).length;
  const todayTodo = todayEntries.filter((e) => (e.key.startsWith("task-") || e.key.startsWith("item-")) && !e.done).length;

  const undated = (data?.tasks ?? []).filter((task) => !task.dueAt).filter(keepTask);
  const periodLabel = view === "month"
    ? formatDate(monthStart, { month: "long", year: "numeric" })
    : `${formatDate(days[0], { day: "numeric", month: "short" })} – ${formatDate(days[6], { day: "numeric", month: "short", year: "numeric" })}`;

  function shift(direction: 1 | -1) {
    setAnchor((prev) => (view === "month"
      ? new Date(prev.getFullYear(), prev.getMonth() + direction, 1)
      : addDays(prev, 7 * direction)));
  }

  function openWeek(day: Date) {
    setAnchor(day);
    setView("week");
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
              { id: "week", label: t("عرض أسبوعي", "Week view") },
              { id: "month", label: t("عرض شهري", "Month view") },
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

      <div className="cal-layout">
        <aside className="cal-rail">
          {nextSlot && (
            <section className="cal-card cal-next">
              <p className="cal-next-when">
                {new Date(`${nextSlot.day}T${nextSlot.shift.dialysisStart}`) <= now
                  ? t("جارية الآن", "Happening now")
                  : nextSlot.day === todayKey
                    ? t("التالي اليوم", "Next today")
                    : `${t("التالي", "Next")} · ${formatDate(`${nextSlot.day}T00:00`, { weekday: "long", day: "numeric", month: "short" })}`}
              </p>
              <p className="cal-next-title">{shiftLabel[nextSlot.shift.name]}</p>
              <p className="cal-next-meta">
                {nextSlot.ward ? `${nextSlot.ward} · ` : ""}{nextSlot.shift.dialysisStart}–{nextSlot.shift.dialysisEnd}
              </p>
              {nextSlot.patients > 0 && (
                <p className="cal-next-meta">{nextSlot.patients} {t("مرضى", "patients")}</p>
              )}
            </section>
          )}

          <section className="cal-card">
            <p className="cal-card-title">{formatDate(monthStart, { month: "long", year: "numeric" })}</p>
            <div className="cal-mini">
              {weekDays.map((day) => (
                <span key={`mini-head-${day.getDay()}`} className="cal-mini-head">{formatDate(day, { weekday: "narrow" })}</span>
              ))}
              {monthDays.map((day) => {
                const key = toLocalDateInputValue(day);
                const classes = [
                  "cal-mini-day",
                  day.getMonth() !== anchor.getMonth() && "is-outside",
                  key === todayKey && "is-today",
                  view === "week" && weekKeys.includes(key) && "is-selected",
                  entriesOn(key).length > 0 && "has-entries",
                ].filter(Boolean).join(" ");
                return (
                  <button key={key} type="button" className={classes} onClick={() => openWeek(day)}>
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="cal-card">
            <p className="cal-card-title">{t("اليوم", "Today")}</p>
            <div className="cal-stats">
              <div><b>{todayPatients}</b><span>{t("مرضى", "Patients")}</span></div>
              <div><b>{todayTodo}</b><span>{t("مهام وأعمال", "To do")}</span></div>
            </div>
          </section>

          <section className="cal-card cal-legend">
            <span className="cal-chip tone-appointment">{t("جلسة مجدولة", "Scheduled session")}</span>
            <span className="cal-chip tone-arrived">{t("وصل المريض", "Patient arrived")}</span>
            <span className="cal-chip tone-live">{t("على الجهاز", "On machine")}</span>
            <span className="cal-chip tone-high">{t("متأخر", "Late")}</span>
            <span className="cal-chip tone-shift">{t("مناوبتي", "My shift")}</span>
            <span className="cal-chip tone-urgent">{t("عاجل", "Urgent")}</span>
            <span className="cal-chip tone-task">{t("مهمة / عمل", "Task / work")}</span>
            <span className="cal-chip tone-appointment has-flag">{t("تنبيه سريري نشط", "Active clinical alert")}</span>
            <span className="cal-chip tone-appointment is-done"><span className="cal-event-label">{t("منجز / غائب", "Done / absent")}</span></span>
          </section>
        </aside>

        <div className="min-w-0">
          {shownDays.length === 0 ? (
            <div className="cal-sheet cal-empty">{view === "week"
              ? t("لا توجد مناوبات أو مواعيد أو مهام هذا الأسبوع.", "No shifts, sessions, or tasks this week.")
              : t("لا توجد مناوبات أو مواعيد أو مهام هذا الشهر.", "No shifts, sessions, or tasks this month.")}</div>
          ) : (
            <div className="cal-sheet">
              <div
                className={`cal-grid${view === "week" ? " is-week" : ""}`}
                style={{ "--cols": view === "week" ? shownDays.length : 7 } as CSSProperties}
              >
                {shownDays.map((day) => {
                  const key = toLocalDateInputValue(day);
                  const dayEntries = entriesOn(key);
                  const isOpen = expanded === key;
                  const limit = view === "week" ? VISIBLE_PER_WEEK_DAY : VISIBLE_PER_DAY;
                  const shown = isOpen ? dayEntries : dayEntries.slice(0, limit);
                  return (
                    <div key={key} className="cal-cell">
                      <div className="cal-cellhead">
                        {formatDate(day, { weekday: "short" })}
                        <button
                          type="button"
                          className={`cal-daynum${key === todayKey ? " is-today" : ""}`}
                          onClick={() => openWeek(day)}
                          aria-label={formatDate(day, { dateStyle: "full" })}
                        >
                          {day.getDate()}
                        </button>
                      </div>
                      {shown.map((entry) => <CalendarEvent key={entry.key} entry={entry} />)}
                      {dayEntries.length > limit && (
                        <button className="cal-more" onClick={() => setExpanded(isOpen ? null : key)}>
                          {isOpen ? t("عرض أقل", "Show less") : `+${dayEntries.length - limit} ${t("أخرى", "more")}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {undated.length > 0 && (
            <section className="mt-5 rounded-lg border border-border bg-surface p-4">
              <h2>{t("مهام بدون موعد محدد", "Tasks with no due date")}</h2>
              <div className="mt-3 grid gap-1">
                {undated.map((task) => (
                  <CalendarEvent key={task.id} entry={{ ...taskEntry(task), key: task.id, day: "", time: "" }} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
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
  const className = `cal-event ${entry.tone}${entry.done ? " is-done" : ""}${entry.flag ? " has-flag" : ""}`;
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
          <FilterSelect
            name="priority"
            defaultValue="NORMAL"
            className="min-w-[10rem]"
            aria-label={t("الأولوية", "Priority")}
            options={[
              { id: "URGENT", label: t("عاجلة", "Urgent") },
              { id: "HIGH", label: t("عالية", "High") },
              { id: "NORMAL", label: t("عادية", "Normal") },
              { id: "LOW", label: t("منخفضة", "Low") },
            ]}
          />
        </label>
        <button type="submit" disabled={saving} className="bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
          {saving ? t("جاري الحفظ...", "Saving...") : t("حفظ", "Save")}
        </button>
      </div>
      <ErrorNote message={error} />
    </form>
  );
}
