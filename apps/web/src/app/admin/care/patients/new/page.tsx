"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
import { toast } from "@/components/Toaster";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const labelClass = "mb-1 block text-sm font-medium text-slate-600";

export default function NewPatientPage() {
  const { t } = useI18n();
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
      toast.success(t("تم حفظ المريض بنجاح", "Patient saved successfully"));
      router.push(`/admin/care/patients/${patient.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("تعذر إنشاء المريض", "Unable to create patient");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">{t("إضافة مريض جديد", "Add new patient")}</h1>

      <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fullName" className={labelClass}>{t("الاسم الكامل *", "Full name *")}</label>
            <input id="fullName" name="fullName" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="gender" className={labelClass}>{t("الجنس *", "Sex *")}</label>
            <select id="gender" name="gender" required className={inputClass} defaultValue="">
              <option value="" disabled>
                {t("اختر...", "Select...")}
              </option>
              <option value="MALE">{t("ذكر", "Male")}</option>
              <option value="FEMALE">{t("أنثى", "Female")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="dateOfBirth" className={labelClass}>{t("تاريخ الميلاد *", "Date of birth *")}</label>
            <input id="dateOfBirth" type="date" name="dateOfBirth" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>{t("الهاتف", "Phone")}</label>
            <input id="phone" name="phone" className={inputClass} />
          </div>
          <div>
            <label htmlFor="address" className={labelClass}>{t("العنوان", "Address")}</label>
            <input id="address" name="address" className={inputClass} />
          </div>
          <div>
            <label htmlFor="fileNumber" className={labelClass}>{t("رقم الإضبارة", "File number")}</label>
            <input id="fileNumber" name="fileNumber" className={inputClass} />
          </div>
          <div>
            <label htmlFor="dialysisStartDate" className={labelClass}>{t("تاريخ بدء الديلزة", "Dialysis start date")}</label>
            <input id="dialysisStartDate" type="date" name="dialysisStartDate" className={inputClass} />
          </div>
          <div>
            <label htmlFor="dryWeight" className={labelClass}>{t("الوزن الجاف (Dry Weight)", "Dry weight")}</label>
            <input id="dryWeight" type="number" step="0.1" name="dryWeight" className={inputClass} />
          </div>
          <div>
            <label htmlFor="vascularAccessType" className={labelClass}>{t("نوع الوصول الوعائي", "Vascular access type")}</label>
            <select id="vascularAccessType" name="vascularAccessType" className={inputClass} defaultValue="">
              <option value="">{t("غير محدد", "Not specified")}</option>
              <option value="FISTULA">{t("ناسور", "Fistula")}</option>
              <option value="CATHETER">{t("قسطرة", "Catheter")}</option>
              <option value="GRAFT">{t("وصلة وعائية", "Graft")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="vascularAccessLocation" className={labelClass}>{t("موقع الوصول الوعائي", "Vascular access location")}</label>
            <input id="vascularAccessLocation" name="vascularAccessLocation" className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="diagnoses" className={labelClass}>{t("التشخيصات", "Diagnoses")}</label>
          <textarea id="diagnoses" name="diagnoses" className={inputClass} rows={2} />
        </div>
        <div>
          <label htmlFor="chronicDiseases" className={labelClass}>{t("الأمراض المزمنة (افصل بفاصلة)", "Chronic conditions (comma-separated)")}</label>
          <input id="chronicDiseases" name="chronicDiseases" placeholder={t("مثال: Diabetes, Hypertension", "Example: Diabetes, Hypertension")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="allergies" className={labelClass}>{t("الحساسية", "Allergies")}</label>
          <input id="allergies" name="allergies" className={inputClass} />
        </div>
        <div>
          <label htmlFor="medicalNotes" className={labelClass}>{t("ملاحظات طبية", "Medical notes")}</label>
          <textarea id="medicalNotes" name="medicalNotes" className={inputClass} rows={2} />
        </div>
        <div>
          <label htmlFor="specialInstructions" className={labelClass}>{t("تعليمات خاصة", "Special instructions")}</label>
          <textarea id="specialInstructions" name="specialInstructions" className={inputClass} rows={2} />
        </div>

        <ErrorNote message={error} />

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? t("جاري الحفظ...", "Saving...") : t("حفظ المريض", "Save patient")}
        </button>
      </form>
    </AdminShell>
  );
}
