"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
import { StatusBadge } from "@/components/StatusBadge";
import { DialysisEvent, DialysisEventType, DialysisReading, Machine, SessionOverview } from "@/lib/types";

const getEventTypeLabels = (t: (arabic: string, english: string) => string): Record<DialysisEventType, string> => ({
  NORMAL: t("طبيعي", "Normal"),
  HYPOTENSION: t("هبوط ضغط", "Hypotension"),
  ACCESS_ISSUE: t("مشكلة في الوصول الوعائي", "Vascular access issue"),
  MACHINE_ISSUE: t("عطل جهاز", "Machine issue"),
  MEDICATION_GIVEN: t("إعطاء دواء", "Medication administered"),
  PHYSICIAN_CALLED: t("تم استدعاء الطبيب", "Physician called"),
  SESSION_INTERRUPTED: t("توقفت الجلسة", "Session interrupted"),
  OTHER: t("أخرى", "Other"),
});

export default function SessionDetailPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const eventTypeLabel = getEventTypeLabels(t);
  const params = useParams<{ id: string }>();
  const user = useCurrentUser();
  const [overview, setOverview] = useState<SessionOverview | null>(null);
  const [readings, setReadings] = useState<DialysisReading[]>([]);
  const [events, setEvents] = useState<DialysisEvent[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amendingId, setAmendingId] = useState<string | null>(null);
  const [verifiedActor, setVerifiedActor] = useState<{ id: string; fullName: string; proofToken: string } | null>(null);

  function withVerifiedActor(body: unknown) {
    return verifiedActor ? { ...(body as Record<string, unknown>), verifiedActorToken: verifiedActor.proofToken } : body;
  }

  function refresh() {
    apiFetch(`/appointments/${params.id}/session`)
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : t("تعذر تحميل الجلسة", "Unable to load session")));
    apiFetch(`/appointments/${params.id}/session/readings`)
      .then(setReadings)
      .catch(() => setReadings([]));
    apiFetch(`/appointments/${params.id}/session/events`)
      .then(setEvents)
      .catch(() => setEvents([]));
  }

  useEffect(() => {
    if (!user) return;
    refresh();
    apiFetch("/machines?status=AVAILABLE").then(setMachines).catch(() => setMachines([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  useLiveEvents((event) => {
    if (event.entity === "session") refresh();
  });

  async function submit(path: string, body: unknown, onDone?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/appointments/${params.id}/session${path}`, { method: path === "/pre-dialysis" || path === "/machine" ? "PUT" : "POST", body: JSON.stringify(body) });
      refresh();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر تنفيذ العملية", "Unable to complete action"));
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  if (error && !overview) {
    return <main className="p-8 text-danger">{error}</main>;
  }

  if (!overview) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const session = overview.session;
  const canPreRecord = user.permissions.includes("dialysis.pre.record");
  const canStart = user.permissions.includes("dialysis.start");
  const canReading = user.permissions.includes("dialysis.reading.create");
  const canEvent = user.permissions.includes("dialysis.event.create");
  const canEnd = user.permissions.includes("dialysis.end");
  const canReassign = user.permissions.includes("dialysis.start") || user.permissions.includes("machine.assign");

  return (
    <AdminShell user={user}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{overview.patient.fullName}</h1>
          <p className="text-sm text-muted">{overview.patient.patientCode}</p>
        </div>
        {session ? <StatusBadge group="session" value={session.status} /> : <span className="status-badge tone-muted">{t("لم تبدأ بعد", "Not started")}</span>}
      </div>

      <ErrorNote message={error} className="mt-4" />

      {/* Pre-Dialysis */}
      {!session && canPreRecord && (
        <PreDialysisForm busy={busy} onSubmit={(body) => submit("/pre-dialysis", body)} />
      )}

      {session && session.status === "PRE_DIALYSIS" && (
        <section className="mt-4 rounded-lg border border-border bg-surface p-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">{t("تقييم ما قبل الديلزة", "Pre-dialysis assessment")}</h2>
          <VitalsSummary session={session} />
          {canPreRecord && (
            <button
              onClick={() => submit("/supplies-ready", {})}
              disabled={busy}
              className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {t("تأكيد جاهزية المستلزمات", "Confirm supplies ready")}
            </button>
          )}
        </section>
      )}

      {session && (session.status === "SUPPLIES_READY" || session.status === "WAITING_MACHINE") && (
        <section className="mt-4 rounded-lg border border-border bg-surface p-6">
          <VitalsSummary session={session} />
          <p className="mt-4 text-sm text-warning">
            {session.status === "WAITING_MACHINE"
              ? t("بانتظار تعيين/الموافقة على جهاز - راجع شاشة الجدول أو الردهات.", "Awaiting machine assignment or approval — check the schedule or wards page.")
              : t("المستلزمات جاهزة - بانتظار تعيين جهاز.", "Supplies are ready — awaiting machine assignment.")}
          </p>
        </section>
      )}

      {session && session.status === "ASSIGNED" && canStart && (
        <>
          <section className="mt-4 rounded-lg border border-border bg-surface p-6">
            <VitalsSummary session={session} />
            <p className="mt-2 text-sm text-success">{t("تم تعيين الجهاز:", "Assigned machine:")} {session.machine?.machineCode}</p>
          </section>
          <StartDialysisForm busy={busy} onSubmit={(body) => submit("/start", body)} />
        </>
      )}

      {session && (session.status === "IN_DIALYSIS" || session.status === "POST_DIALYSIS") && (
        <>
          <section className="mt-4 rounded-lg border border-border bg-surface p-6">
            <VitalsSummary session={session} />
            <p className="mt-2 text-sm text-muted">
              {t("الجهاز:", "Machine:")} {session.machine?.machineCode} {t("— بدأت الساعة", "— Started at")}{" "}
              {session.startTime ? formatDate(session.startTime, { hour: "2-digit", minute: "2-digit" }) : "-"}
            </p>
          </section>

          <section className="mt-4 rounded-lg border border-border bg-surface p-6">
            <h2 className="mb-3 text-sm font-semibold text-muted">{t("القراءات الدورية", "Periodic readings")}</h2>
            <ul className="space-y-1 text-sm">
              {readings.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-b border-border-soft py-1">
                  <span>
                    {formatDate(r.time, { hour: "2-digit", minute: "2-digit" })} — {t("ضغط الدم", "BP")} <bdi>{r.bp}</bdi> / {t("النبض", "Pulse")} {r.pulse != null ? formatNumber(r.pulse) : "-"}
                    {r.uf != null ? ` / UF ${formatNumber(Number(r.uf))}` : ""}
                    {r.amendedFromId && <span className="ms-2 text-xs text-warning">{t("(تعديل)", "(Amended)")}</span>}
                  </span>
                  {canReading && amendingId !== r.id && (
                    <button onClick={() => setAmendingId(r.id)} className="text-xs text-muted hover:underline">
                      {t("تعديل", "Amend")}
                    </button>
                  )}
                </li>
              ))}
              {readings.length === 0 && <li className="text-muted">{t("لا توجد قراءات بعد", "No readings yet")}</li>}
            </ul>
            {amendingId && (
              <AmendReadingForm
                busy={busy}
                onCancel={() => setAmendingId(null)}
                onSubmit={(body) =>
                  submit(`/readings/${amendingId}/amendments`, withVerifiedActor(body), () => {
                    setAmendingId(null);
                    // The proof just consumed is single-use (DCMS-055) - drop
                    // it so the next action requires a fresh PIN check rather
                    // than silently failing on a spent token.
                    if (verifiedActor) setVerifiedActor(null);
                  })
                }
              />
            )}
            {canReading && !amendingId && (
              <ReadingForm
                busy={busy}
                onSubmit={(body) =>
                  submit("/readings", withVerifiedActor(body), () => {
                    if (verifiedActor) setVerifiedActor(null);
                  })
                }
              />
            )}
          </section>

          <section className="mt-4 rounded-lg border border-border bg-surface p-6">
            <h2 className="mb-3 text-sm font-semibold text-muted">{t("أحداث الجلسة", "Session events")}</h2>
            <ul className="space-y-1 text-sm">
              {events.map((e) => (
                <li key={e.id} className="border-b border-border-soft py-1">
                  <span className="font-medium text-foreground">[{eventTypeLabel[e.type]}]</span>{" "}
                  {formatDate(e.recordedAt, { hour: "2-digit", minute: "2-digit" })} {e.note ? `— ${e.note}` : ""}
                </li>
              ))}
              {events.length === 0 && <li className="text-muted">{t("لا توجد أحداث بعد", "No events yet")}</li>}
            </ul>
            {canEvent && (
              <EventForm
                busy={busy}
                onSubmit={(body) =>
                  submit("/events", withVerifiedActor(body), () => {
                    if (verifiedActor) setVerifiedActor(null);
                  })
                }
              />
            )}
          </section>

          <PinBanner verifiedActor={verifiedActor} onVerified={setVerifiedActor} />

          {canReassign && session.status === "IN_DIALYSIS" && (
            <ReassignMachineForm busy={busy} machines={machines} onSubmit={(body) => submit("/machine", body)} />
          )}

          {canEnd && session.status === "IN_DIALYSIS" && (
            <EndDialysisForm busy={busy} onSubmit={(body) => submit("/end", body)} />
          )}
        </>
      )}

      {session && (session.status === "COMPLETED" || session.status === "DISCHARGED") && (
        <section className="mt-4 rounded-lg border border-border bg-surface p-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">{t("ملخص الجلسة", "Session summary")}</h2>
          <VitalsSummary session={session} />
          <div className="mt-3 text-sm text-muted">
            <p>{t("وزن ما بعد الجلسة:", "Post-dialysis weight:")} {session.postWeight != null ? formatNumber(Number(session.postWeight)) : "-"} {t("/ UF الفعلي:", "/ Actual UF:")} {session.actualUF != null ? formatNumber(Number(session.actualUF)) : "-"}</p>
            <p>{t("المدة الفعلية:", "Actual duration:")} {session.actualDurationMinutes != null ? formatNumber(session.actualDurationMinutes) : "-"} {t("دقيقة", "minutes")}</p>
            {session.complications && <p>{t("مضاعفات:", "Complications:")} {session.complications}</p>}
            {session.finalNote && <p>{t("ملاحظة ختامية:", "Final note:")} {session.finalNote}</p>}
          </div>
          {session.status === "COMPLETED" && canEnd && (
            <button
              onClick={() => submit("/discharge", {})}
              disabled={busy}
              className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {t("تسجيل الخروج (Discharge)", "Discharge patient")}
            </button>
          )}
        </section>
      )}

      {session && session.status === "INTERRUPTED" && (
        <section className="mt-4 rounded-lg border border-danger bg-surface-secondary p-6 text-sm text-danger">
          {t("توقفت هذه الجلسة قبل اكتمالها.", "This session was interrupted before completion.")}
        </section>
      )}
    </AdminShell>
  );
}

function VitalsSummary({ session }: { session: SessionOverview["session"] }) {
  const { t, formatNumber } = useI18n();
  if (!session) return null;
  return (
    <div className="text-sm text-muted">
      <p>
        {t("الوزن:", "Weight:")} {session.preWeight != null ? formatNumber(Number(session.preWeight)) : "-"} / {t("ضغط الدم:", "BP:")} <bdi>{session.preBP ?? "-"}</bdi> {t("/ النبض:", "/ Pulse:")} {session.prePulse != null ? formatNumber(session.prePulse) : "-"}
      </p>
      {session.preNotes && <p>{t("ملاحظات:", "Notes:")} {session.preNotes}</p>}
    </div>
  );
}

function PreDialysisForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => void }) {
  const { t } = useI18n();
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      weight: Number(form.get("weight")),
      bp: form.get("bp"),
      pulse: Number(form.get("pulse")),
      temperature: form.get("temperature") ? Number(form.get("temperature")) : undefined,
      glucose: form.get("glucose") ? Number(form.get("glucose")) : undefined,
      dryWeight: form.get("dryWeight") ? Number(form.get("dryWeight")) : undefined,
      notes: form.get("notes") || undefined,
    });
  }
  return (
    <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-2 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-muted">{t("تقييم ما قبل الديلزة", "Pre-dialysis assessment")}</h2>
      <input name="weight" type="number" step="0.1" required placeholder={t("الوزن", "Weight")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="bp" required placeholder={t("ضغط الدم (مثال: 120/80)", "Blood pressure (e.g. 120/80)")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="pulse" type="number" required placeholder={t("النبض", "Pulse")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="temperature" type="number" step="0.1" placeholder={t("الحرارة", "Temperature")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="glucose" type="number" step="0.1" placeholder={t("السكر", "Blood glucose")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="dryWeight" type="number" step="0.1" placeholder={t("الوزن الجاف", "Dry weight")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="notes" placeholder={t("ملاحظات", "Notes")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50">
        {t("حفظ", "Save")}
      </button>
    </form>
  );
}

function StartDialysisForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => void }) {
  const { t } = useI18n();
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      dialyzerType: form.get("dialyzerType"),
      bloodLineType: form.get("bloodLineType"),
      prescribedDurationMinutes: Number(form.get("prescribedDurationMinutes")),
      requiredUF: Number(form.get("requiredUF")),
    });
  }
  return (
    <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-2 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-muted">{t("بدء الديلزة (START DIALYSIS)", "Start dialysis")}</h2>
      <input name="dialyzerType" required placeholder={t("نوع الدياليزر", "Dialyzer type")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="bloodLineType" required placeholder={t("نوع خطوط الدم", "Bloodline type")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="prescribedDurationMinutes" type="number" required placeholder={t("المدة الموصوفة (دقيقة)", "Prescribed duration (minutes)")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="requiredUF" type="number" step="0.1" required placeholder={t("UF المطلوب", "Required UF")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white  disabled:opacity-50">
        {t("بدء الديلزة", "Start dialysis")}
      </button>
    </form>
  );
}

function ReadingForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => void }) {
  const { t } = useI18n();
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      bp: form.get("bp"),
      pulse: Number(form.get("pulse")),
      arterialPressure: form.get("arterialPressure") ? Number(form.get("arterialPressure")) : undefined,
      venousPressure: form.get("venousPressure") ? Number(form.get("venousPressure")) : undefined,
      tmp: form.get("tmp") ? Number(form.get("tmp")) : undefined,
      bloodFlow: form.get("bloodFlow") ? Number(form.get("bloodFlow")) : undefined,
      uf: form.get("uf") ? Number(form.get("uf")) : undefined,
    });
    e.currentTarget.reset();
  }
  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-surface-secondary p-3">
      <input name="bp" required placeholder={t("ضغط الدم", "BP")} className="w-20 rounded-md border border-border px-2 py-1 text-xs" />
      <input name="pulse" type="number" required placeholder={t("النبض", "Pulse")} className="w-16 rounded-md border border-border px-2 py-1 text-xs" />
      <input name="arterialPressure" type="number" placeholder={t("الضغط الشرياني", "Arterial pressure")} className="w-20 rounded-md border border-border px-2 py-1 text-xs" />
      <input name="venousPressure" type="number" placeholder={t("الضغط الوريدي", "Venous pressure")} className="w-20 rounded-md border border-border px-2 py-1 text-xs" />
      <input name="tmp" type="number" placeholder="TMP" aria-label={t("الضغط عبر الغشاء", "Transmembrane pressure")} className="w-16 rounded-md border border-border px-2 py-1 text-xs" />
      <input name="bloodFlow" type="number" placeholder={t("تدفق الدم", "Blood flow")} className="w-16 rounded-md border border-border px-2 py-1 text-xs" />
      <input name="uf" type="number" step="0.1" placeholder="UF" aria-label={t("الترشيح الفائق", "Ultrafiltration")} className="w-16 rounded-md border border-border px-2 py-1 text-xs" />
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground disabled:opacity-50">
        {t("إضافة قراءة", "Add reading")}
      </button>
    </form>
  );
}

function AmendReadingForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (body: unknown) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      bp: form.get("bp"),
      pulse: Number(form.get("pulse")),
      reason: form.get("reason"),
    });
  }
  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-warning bg-surface-secondary p-3">
      <input name="bp" required placeholder={t("BP الصحيح", "Correct blood pressure")} className="w-20 rounded-md border border-border px-2 py-1 text-xs" />
      <input name="pulse" type="number" required placeholder={t("Pulse الصحيح", "Correct pulse")} className="w-20 rounded-md border border-border px-2 py-1 text-xs" />
      <input name="reason" required placeholder={t("سبب التعديل", "Reason for amendment")} className="w-40 rounded-md border border-border px-2 py-1 text-xs" />
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50">
        {t("حفظ التعديل", "Save amendment")}
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-muted">
        {t("إلغاء", "Cancel")}
      </button>
    </form>
  );
}

function EventForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => void }) {
  const { t } = useI18n();
  const eventTypeLabel = getEventTypeLabels(t);
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({ type: form.get("type"), note: form.get("note") || undefined });
    e.currentTarget.reset();
  }
  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-surface-secondary p-3">
      <select name="type" required className="rounded-md border border-border px-2 py-1 text-xs">
        {Object.entries(eventTypeLabel).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input name="note" placeholder={t("ملاحظة", "Note")} className="w-48 rounded-md border border-border px-2 py-1 text-xs" />
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground disabled:opacity-50">
        {t("تسجيل حدث", "Record event")}
      </button>
    </form>
  );
}

function ReassignMachineForm({
  busy,
  machines,
  onSubmit,
}: {
  busy: boolean;
  machines: Machine[];
  onSubmit: (body: unknown) => void;
}) {
  const { t } = useI18n();
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({ newMachineId: form.get("newMachineId"), reason: form.get("reason") });
  }
  return (
    <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-2 rounded-lg border border-danger bg-surface-secondary p-4">
      <h2 className="text-sm font-semibold text-danger">{t("إعادة تعيين جهاز (عطل أثناء الجلسة)", "Reassign machine (fault during session)")}</h2>
      <select name="newMachineId" required className="w-full rounded-md border border-border px-3 py-1.5 text-sm">
        <option value="">{t("اختر الجهاز الجديد...", "Select a replacement machine...")}</option>
        {machines.map((m) => (
          <option key={m.id} value={m.id}>
            {m.machineCode}
          </option>
        ))}
      </select>
      <input name="reason" required placeholder={t("سبب العطل", "Reason for fault")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <button type="submit" disabled={busy} className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white  disabled:opacity-50">
        {t("إعادة التعيين", "Reassign")}
      </button>
    </form>
  );
}

function EndDialysisForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => void }) {
  const { t } = useI18n();
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      postWeight: Number(form.get("postWeight")),
      postBP: form.get("postBP"),
      postPulse: Number(form.get("postPulse")),
      actualUF: Number(form.get("actualUF")),
      complications: form.get("complications") || undefined,
      finalNote: form.get("finalNote") || undefined,
    });
  }
  return (
    <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-2 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-muted">{t("إنهاء الديلزة (END DIALYSIS)", "End dialysis")}</h2>
      <input name="postWeight" type="number" step="0.1" required placeholder={t("الوزن بعد الجلسة", "Post-dialysis weight")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="postBP" required placeholder={t("ضغط الدم بعد الجلسة", "Post-dialysis blood pressure")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="postPulse" type="number" required placeholder={t("النبض بعد الجلسة", "Post-dialysis pulse")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="actualUF" type="number" step="0.1" required placeholder={t("UF الفعلي", "Actual UF")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="complications" placeholder={t("مضاعفات (إن وجدت)", "Complications (if any)")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <input name="finalNote" placeholder={t("ملاحظة ختامية", "Final note")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50">
        {t("إنهاء الجلسة", "End session")}
      </button>
    </form>
  );
}

// Lets whoever is physically at a shared/logged-in device identify
// themselves via PIN so the next reading/event/amend is attributed to them,
// not the device's own session (docs/PROJECT-PHASES-PLAN.md Phase 7:
// "PIN سريع بعد الدخول الأساسي").
function PinBanner({
  verifiedActor,
  onVerified,
}: {
  verifiedActor: { id: string; fullName: string; proofToken: string } | null;
  onVerified: (actor: { id: string; fullName: string; proofToken: string } | null) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch("/pin-verifications", { method: "POST", body: JSON.stringify({ username, pin }) });
      onVerified(result);
      setOpen(false);
      setUsername("");
      setPin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("فشل التحقق", "Verification failed"));
    } finally {
      setBusy(false);
    }
  }

  if (verifiedActor) {
    return (
      <div className="mt-4 flex items-center justify-between rounded-md bg-surface-secondary px-3 py-2 text-sm text-success">
        <span>{t("سيتم تسجيل الإجراء القادم فقط باسم:", "Only the next action will be recorded under:")} {verifiedActor.fullName}</span>
        <button onClick={() => onVerified(null)} className="text-xs text-success hover:underline">
          {t("إلغاء", "Cancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs font-medium text-muted hover:underline">
          {t("تسجيل الدخول السريع بـ PIN (جهاز مشترك)", "Quick PIN verification (shared device)")}
        </button>
      ) : (
        <form onSubmit={handleVerify} className="flex flex-wrap items-center gap-2 rounded-md bg-surface-secondary p-3">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("اسم المستخدم", "Username")} className="w-32 rounded-md border border-border px-2 py-1 text-xs" />
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" aria-label={t("رمز التعريف الشخصي", "Personal identification number")} inputMode="numeric" className="w-20 rounded-md border border-border px-2 py-1 text-xs" />
          <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground disabled:opacity-50">
            {t("تحقق", "Verify")}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
            {t("إلغاء", "Cancel")}
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </form>
      )}
    </div>
  );
}
