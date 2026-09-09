"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { DialysisEvent, DialysisEventType, DialysisReading, Machine, SessionOverview } from "@/lib/types";

const statusLabel: Record<string, string> = {
  PRE_DIALYSIS: "تقييم ما قبل الديلزة",
  SUPPLIES_READY: "المستلزمات جاهزة",
  WAITING_MACHINE: "بانتظار جهاز",
  ASSIGNED: "تم تعيين الجهاز",
  IN_DIALYSIS: "الديلزة جارية",
  POST_DIALYSIS: "ما بعد الديلزة",
  COMPLETED: "مكتملة",
  DISCHARGED: "تم الخروج",
  INTERRUPTED: "متوقفة",
};

const eventTypeLabel: Record<DialysisEventType, string> = {
  NORMAL: "طبيعي",
  HYPOTENSION: "هبوط ضغط",
  ACCESS_ISSUE: "مشكلة في الوصول الوعائي",
  MACHINE_ISSUE: "عطل جهاز",
  MEDICATION_GIVEN: "إعطاء دواء",
  PHYSICIAN_CALLED: "تم استدعاء الطبيب",
  SESSION_INTERRUPTED: "توقفت الجلسة",
  OTHER: "أخرى",
};

const POLL_MS = 15000;

export default function SessionDetailPage() {
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
    apiFetch(`/sessions/${params.id}`)
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : "تعذر تحميل الجلسة"));
    apiFetch(`/sessions/${params.id}/readings`)
      .then(setReadings)
      .catch(() => setReadings([]));
    apiFetch(`/sessions/${params.id}/events`)
      .then(setEvents)
      .catch(() => setEvents([]));
  }

  useEffect(() => {
    if (!user) return;
    refresh();
    apiFetch("/machines?status=AVAILABLE").then(setMachines).catch(() => setMachines([]));
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  async function submit(path: string, body: unknown, onDone?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/sessions/${params.id}${path}`, { method: "POST", body: JSON.stringify(body) });
      refresh();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  if (error && !overview) {
    return <main className="p-8 text-red-600">{error}</main>;
  }

  if (!overview) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
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
          <h1 className="text-xl font-semibold text-slate-800">{overview.patient.fullName}</h1>
          <p className="text-sm text-slate-500">{overview.patient.patientCode}</p>
        </div>
        <span className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
          {session ? (statusLabel[session.status] ?? session.status) : "لم تبدأ بعد"}
        </span>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {/* Pre-Dialysis */}
      {!session && canPreRecord && (
        <PreDialysisForm busy={busy} onSubmit={(body) => submit("/pre-dialysis", body)} />
      )}

      {session && session.status === "PRE_DIALYSIS" && (
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">تقييم ما قبل الديلزة</h2>
          <VitalsSummary session={session} />
          {canPreRecord && (
            <button
              onClick={() => submit("/confirm-supplies-ready", {})}
              disabled={busy}
              className="mt-4 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              تأكيد جاهزية المستلزمات
            </button>
          )}
        </section>
      )}

      {session && (session.status === "SUPPLIES_READY" || session.status === "WAITING_MACHINE") && (
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
          <VitalsSummary session={session} />
          <p className="mt-4 text-sm text-amber-600">
            {session.status === "WAITING_MACHINE"
              ? "بانتظار تعيين/الموافقة على جهاز - راجع شاشة الجدول أو الردهات."
              : "المستلزمات جاهزة - بانتظار تعيين جهاز."}
          </p>
        </section>
      )}

      {session && session.status === "ASSIGNED" && canStart && (
        <>
          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
            <VitalsSummary session={session} />
            <p className="mt-2 text-sm text-emerald-600">تم تعيين الجهاز: {session.machine?.machineCode}</p>
          </section>
          <StartDialysisForm busy={busy} onSubmit={(body) => submit("/start", body)} />
        </>
      )}

      {session && (session.status === "IN_DIALYSIS" || session.status === "POST_DIALYSIS") && (
        <>
          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
            <VitalsSummary session={session} />
            <p className="mt-2 text-sm text-slate-600">
              الجهاز: {session.machine?.machineCode} — بدأت الساعة{" "}
              {session.startTime ? new Date(session.startTime).toLocaleTimeString() : "-"}
            </p>
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">القراءات الدورية</h2>
            <ul className="space-y-1 text-sm">
              {readings.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-b border-slate-50 py-1">
                  <span>
                    {new Date(r.time).toLocaleTimeString()} — BP {r.bp} / Pulse {r.pulse}
                    {r.uf ? ` / UF ${r.uf}` : ""}
                    {r.amendedFromId && <span className="mr-2 text-xs text-amber-600">(تعديل)</span>}
                  </span>
                  {canReading && amendingId !== r.id && (
                    <button onClick={() => setAmendingId(r.id)} className="text-xs text-slate-500 hover:underline">
                      تعديل
                    </button>
                  )}
                </li>
              ))}
              {readings.length === 0 && <li className="text-slate-400">لا توجد قراءات بعد</li>}
            </ul>
            {amendingId && (
              <AmendReadingForm
                busy={busy}
                onCancel={() => setAmendingId(null)}
                onSubmit={(body) =>
                  submit(`/readings/${amendingId}/amend`, withVerifiedActor(body), () => {
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

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">أحداث الجلسة</h2>
            <ul className="space-y-1 text-sm">
              {events.map((e) => (
                <li key={e.id} className="border-b border-slate-50 py-1">
                  <span className="font-medium text-slate-700">[{eventTypeLabel[e.type]}]</span>{" "}
                  {new Date(e.recordedAt).toLocaleTimeString()} {e.note ? `— ${e.note}` : ""}
                </li>
              ))}
              {events.length === 0 && <li className="text-slate-400">لا توجد أحداث بعد</li>}
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
            <ReassignMachineForm busy={busy} machines={machines} onSubmit={(body) => submit("/reassign-machine", body)} />
          )}

          {canEnd && session.status === "IN_DIALYSIS" && (
            <EndDialysisForm busy={busy} onSubmit={(body) => submit("/end", body)} />
          )}
        </>
      )}

      {session && (session.status === "COMPLETED" || session.status === "DISCHARGED") && (
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">ملخص الجلسة</h2>
          <VitalsSummary session={session} />
          <div className="mt-3 text-sm text-slate-600">
            <p>وزن ما بعد الجلسة: {session.postWeight ?? "-"} / UF الفعلي: {session.actualUF ?? "-"}</p>
            <p>المدة الفعلية: {session.actualDurationMinutes ?? "-"} دقيقة</p>
            {session.complications && <p>مضاعفات: {session.complications}</p>}
            {session.finalNote && <p>ملاحظة ختامية: {session.finalNote}</p>}
          </div>
          {session.status === "COMPLETED" && canEnd && (
            <button
              onClick={() => submit("/discharge", {})}
              disabled={busy}
              className="mt-4 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              تسجيل الخروج (Discharge)
            </button>
          )}
        </section>
      )}

      {session && session.status === "INTERRUPTED" && (
        <section className="mt-4 rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          توقفت هذه الجلسة قبل اكتمالها.
        </section>
      )}
    </AdminShell>
  );
}

function VitalsSummary({ session }: { session: SessionOverview["session"] }) {
  if (!session) return null;
  return (
    <div className="text-sm text-slate-600">
      <p>
        الوزن: {session.preWeight ?? "-"} / BP: {session.preBP ?? "-"} / النبض: {session.prePulse ?? "-"}
      </p>
      {session.preNotes && <p>ملاحظات: {session.preNotes}</p>}
    </div>
  );
}

function PreDialysisForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => void }) {
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
    <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-500">تقييم ما قبل الديلزة</h2>
      <input name="weight" type="number" step="0.1" required placeholder="الوزن" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="bp" required placeholder="ضغط الدم (مثال: 120/80)" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="pulse" type="number" required placeholder="النبض" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="temperature" type="number" step="0.1" placeholder="الحرارة" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="glucose" type="number" step="0.1" placeholder="السكر" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="dryWeight" type="number" step="0.1" placeholder="الوزن الجاف" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="notes" placeholder="ملاحظات" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">
        حفظ
      </button>
    </form>
  );
}

function StartDialysisForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => void }) {
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
    <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-500">بدء الديلزة (START DIALYSIS)</h2>
      <input name="dialyzerType" required placeholder="نوع الدياليزر" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="bloodLineType" required placeholder="نوع خطوط الدم" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="prescribedDurationMinutes" type="number" required placeholder="المدة الموصوفة (دقيقة)" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="requiredUF" type="number" step="0.1" required placeholder="UF المطلوب" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <button type="submit" disabled={busy} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        بدء الديلزة
      </button>
    </form>
  );
}

function ReadingForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => void }) {
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
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-3">
      <input name="bp" required placeholder="BP" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <input name="pulse" type="number" required placeholder="Pulse" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <input name="arterialPressure" type="number" placeholder="Arterial" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <input name="venousPressure" type="number" placeholder="Venous" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <input name="tmp" type="number" placeholder="TMP" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <input name="bloodFlow" type="number" placeholder="BF" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <input name="uf" type="number" step="0.1" placeholder="UF" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">
        إضافة قراءة
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
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 p-3">
      <input name="bp" required placeholder="BP الصحيح" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <input name="pulse" type="number" required placeholder="Pulse الصحيح" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <input name="reason" required placeholder="سبب التعديل" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <button type="submit" disabled={busy} className="rounded bg-amber-600 px-3 py-1 text-xs text-white disabled:opacity-50">
        حفظ التعديل
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-slate-400">
        إلغاء
      </button>
    </form>
  );
}

function EventForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => void }) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({ type: form.get("type"), note: form.get("note") || undefined });
    e.currentTarget.reset();
  }
  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-3">
      <select name="type" required className="rounded-md border border-slate-300 px-2 py-1 text-xs">
        {Object.entries(eventTypeLabel).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input name="note" placeholder="ملاحظة" className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs" />
      <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">
        تسجيل حدث
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
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({ newMachineId: form.get("newMachineId"), reason: form.get("reason") });
  }
  return (
    <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-2 rounded-lg border border-red-200 bg-red-50 p-4">
      <h2 className="text-sm font-semibold text-red-700">إعادة تعيين جهاز (عطل أثناء الجلسة)</h2>
      <select name="newMachineId" required className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
        <option value="">اختر الجهاز الجديد...</option>
        {machines.map((m) => (
          <option key={m.id} value={m.id}>
            {m.machineCode}
          </option>
        ))}
      </select>
      <input name="reason" required placeholder="سبب العطل" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <button type="submit" disabled={busy} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
        إعادة التعيين
      </button>
    </form>
  );
}

function EndDialysisForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => void }) {
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
    <form onSubmit={handleSubmit} className="mt-4 max-w-lg space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-500">إنهاء الديلزة (END DIALYSIS)</h2>
      <input name="postWeight" type="number" step="0.1" required placeholder="الوزن بعد الجلسة" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="postBP" required placeholder="ضغط الدم بعد الجلسة" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="postPulse" type="number" required placeholder="النبض بعد الجلسة" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="actualUF" type="number" step="0.1" required placeholder="UF الفعلي" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="complications" placeholder="مضاعفات (إن وجدت)" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <input name="finalNote" placeholder="ملاحظة ختامية" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">
        إنهاء الجلسة
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
      const result = await apiFetch("/nursing/verify-pin", { method: "POST", body: JSON.stringify({ username, pin }) });
      onVerified(result);
      setOpen(false);
      setUsername("");
      setPin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل التحقق");
    } finally {
      setBusy(false);
    }
  }

  if (verifiedActor) {
    return (
      <div className="mt-4 flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        <span>سيتم تسجيل الإجراء القادم فقط باسم: {verifiedActor.fullName}</span>
        <button onClick={() => onVerified(null)} className="text-xs text-emerald-800 hover:underline">
          إلغاء
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs font-medium text-slate-500 hover:underline">
          تسجيل الدخول السريع بـ PIN (جهاز مشترك)
        </button>
      ) : (
        <form onSubmit={handleVerify} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-3">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="اسم المستخدم" className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" inputMode="numeric" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">
            تحقق
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400">
            إلغاء
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </form>
      )}
    </div>
  );
}
