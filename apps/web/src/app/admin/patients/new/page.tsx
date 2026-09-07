"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const labelClass = "mb-1 block text-sm font-medium text-slate-600";

export default function NewPatientPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const chronicDiseasesRaw = String(form.get("chronicDiseases") ?? "").trim();

    const payload: Record<string, unknown> = {
      fullName: form.get("fullName"),
      gender: form.get("gender"),
      dateOfBirth: form.get("dateOfBirth"),
      phone: form.get("phone") || undefined,
      address: form.get("address") || undefined,
      fileNumber: form.get("fileNumber") || undefined,
      dialysisStartDate: form.get("dialysisStartDate") || undefined,
      dryWeight: form.get("dryWeight") ? Number(form.get("dryWeight")) : undefined,
      vascularAccessType: form.get("vascularAccessType") || undefined,
      vascularAccessLocation: form.get("vascularAccessLocation") || undefined,
      diagnoses: form.get("diagnoses") || undefined,
      chronicDiseases: chronicDiseasesRaw
        ? chronicDiseasesRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      allergies: form.get("allergies") || undefined,
      medicalNotes: form.get("medicalNotes") || undefined,
      specialInstructions: form.get("specialInstructions") || undefined,
    };

    try {
      const patient = await apiFetch("/patients", { method: "POST", body: JSON.stringify(payload) });
      router.push(`/admin/patients/${patient.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء المريض");
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">إضافة مريض جديد</h1>

      <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>الاسم الكامل *</label>
            <input name="fullName" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>الجنس *</label>
            <select name="gender" required className={inputClass} defaultValue="">
              <option value="" disabled>
                اختر...
              </option>
              <option value="MALE">ذكر</option>
              <option value="FEMALE">أنثى</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>تاريخ الميلاد *</label>
            <input type="date" name="dateOfBirth" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>الهاتف</label>
            <input name="phone" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>العنوان</label>
            <input name="address" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>رقم الإضبارة</label>
            <input name="fileNumber" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>تاريخ بدء الديلزة</label>
            <input type="date" name="dialysisStartDate" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>الوزن الجاف (Dry Weight)</label>
            <input type="number" step="0.1" name="dryWeight" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>نوع الوصول الوعائي</label>
            <select name="vascularAccessType" className={inputClass} defaultValue="">
              <option value="">غير محدد</option>
              <option value="FISTULA">Fistula</option>
              <option value="CATHETER">Catheter</option>
              <option value="GRAFT">Graft</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>موقع الوصول الوعائي</label>
            <input name="vascularAccessLocation" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>التشخيصات</label>
          <textarea name="diagnoses" className={inputClass} rows={2} />
        </div>
        <div>
          <label className={labelClass}>الأمراض المزمنة (افصل بفاصلة)</label>
          <input name="chronicDiseases" placeholder="مثال: Diabetes, Hypertension" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>الحساسية</label>
          <input name="allergies" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>ملاحظات طبية</label>
          <textarea name="medicalNotes" className={inputClass} rows={2} />
        </div>
        <div>
          <label className={labelClass}>تعليمات خاصة</label>
          <textarea name="specialInstructions" className={inputClass} rows={2} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "جاري الحفظ..." : "حفظ المريض"}
        </button>
      </form>
    </AdminShell>
  );
}
