"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { PaginatedTable, type TableColumn } from "@/components/PaginatedTable";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/components/Toaster";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { Paginated, Patient } from "@/lib/types";

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

// V1.1 rebuild (docs/COMPREHENSIVE-DEVELOPMENT-PLAN-V1.md §2.2): the registry
// paginates server-side with a status filter, renders skeleton rows, an
// explanatory empty state, colored status badges, and toasts every failure -
// replacing the old unbounded bare-array table.
export default function PatientsPage() {
  const { t, formatDate } = useI18n();
  const user = useCurrentUser();
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(queryInput), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [queryInput]);

  useEffect(() => setPage(1), [query, status]);

  const searching = query.trim().length > 0;
  const list = useApi<Paginated<Patient>>(
    !searching && user ? `/patients?page=${page}&limit=${PAGE_SIZE}${status ? `&status=${status}` : ""}` : null,
  );

  const [searchState, setSearchState] = useState<{ rows: Patient[] | null; loading: boolean; error: string | null }>({
    rows: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    if (!user || !searching) return;
    let cancelled = false;
    setSearchState((prev) => ({ ...prev, loading: true, error: null }));
    apiFetch(`/patients/search?q=${encodeURIComponent(query.trim())}`)
      .then((data) => {
        if (!cancelled) setSearchState({ rows: data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setSearchState({ rows: null, loading: false, error: err instanceof Error ? err.message : "Search failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [user, query, searching]);

  useEffect(() => {
    if (list.error) {
      toast.error(t("تعذر تحميل قائمة المرضى. تحقق من الاتصال وحاول مجدداً.", "Unable to load patients. Check your connection and try again."));
    }
  }, [list.error, t]);
  useEffect(() => {
    if (searchState.error) {
      toast.error(t("تعذر تنفيذ البحث. تحقق من الاتصال وحاول مجدداً.", "Unable to search. Check your connection and try again."));
    }
  }, [searchState.error, t]);

  // Live registry (V1.1 acceptance 5): the gateway broadcasts a data-free
  // "patient changed" tag; this page re-fetches its own gated data and tells
  // the user - no refresh button, no 15s polling.
  useLiveEvents((event) => {
    if (event.entity !== "patient") return;
    list.refresh();
    toast.info(t("تحديث حي: تغيّر سجل المرضى", "Live update: the patient registry changed"));
  });

  const rows = searching ? searchState.rows : list.data?.data ?? null;
  const total = searching ? searchState.rows?.length ?? 0 : list.data?.total ?? null;
  const loading = !user || (searching ? searchState.loading : list.loading);
  const error = searching ? searchState.error : list.error;

  const statusFilters = [
    { value: "", ar: "الكل", en: "All" },
    { value: "ACTIVE", ar: "نشط", en: "Active" },
    { value: "INACTIVE", ar: "غير نشط", en: "Inactive" },
    { value: "TRANSFERRED", ar: "منقول", en: "Transferred" },
    { value: "ON_HOLD", ar: "موقوف مؤقتاً", en: "On hold" },
    { value: "TRANSPLANTED", ar: "زراعة كلية", en: "Transplanted" },
    { value: "DECEASED", ar: "متوفى", en: "Deceased" },
  ];

  const columns: TableColumn<Patient>[] = [
    {
      key: "patientCode",
      header: t("الرقم", "ID"),
      render: (patient) => (
        <Link href={`/admin/care/patients/${patient.id}`} className="text-slate-800 hover:underline">{patient.patientCode}</Link>
      ),
    },
    { key: "fullName", header: t("الاسم", "Name"), render: (patient) => <bdi>{patient.fullName}</bdi> },
    { key: "fileNumber", header: t("رقم الإضبارة", "File number"), render: (patient) => patient.fileNumber ?? "-" },
    { key: "phone", header: t("الهاتف", "Phone"), render: (patient) => patient.phone ?? "-" },
    { key: "registeredAt", header: t("تاريخ التسجيل", "Registered"), render: (patient) => formatDate(patient.registeredAt) },
    { key: "status", header: t("الحالة", "Status"), render: (patient) => <StatusBadge group="patient" value={patient.status} /> },
  ];


  if (!user) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">{t("سجل المرضى", "Patient registry")}</h1>
        {user.permissions.includes("patient.create") && (
          <Link href="/admin/care/patients/new" className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {t("+ إضافة مريض", "+ Add patient")}
          </Link>
        )}
      </div>

      <input
        type="text"
        placeholder={t("ابحث بالاسم، رقم الإضبارة، أو الهاتف...", "Search by name, file number, or phone...")}
        value={queryInput}
        onChange={(e) => setQueryInput(e.target.value)}
        className="mt-4 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={t("فلترة حسب الحالة", "Filter by status")}>
        {statusFilters.map((filter) => (
          <button key={filter.value} type="button" aria-pressed={status === filter.value} onClick={() => setStatus(filter.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${status === filter.value ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            {t(filter.ar, filter.en)}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <PaginatedTable
          columns={columns}
          rows={rows}
          total={total}
          page={searching ? 1 : page}
          pageSize={searching ? Math.max(1, rows?.length ?? 1) : PAGE_SIZE}
          onPageChange={setPage}
          loading={loading}
          error={error}
          onRetry={searching ? undefined : list.refresh}
          hidePagination={searching}
          emptyTitle={searching ? t("لا توجد نتائج مطابقة", "No matching results") : t("لا يوجد مرضى بعد", "No patients yet")}
          emptyDescription={searching
            ? t("جرّب اسمًا أو رقمًا مختلفًا، أو امسح البحث لعرض السجل كاملًا.", "Try a different name or number, or clear the search to see the full registry.")
            : t("أول مريض يُسجل سيظهر هنا مباشرة.", "The first registered patient will appear here.")}
        />
      </div>
      {searching && (
        <p className="mt-2 text-xs text-slate-400">
          {t("البحث يعرض حتى 100 نتيجة — امسح البحث للتصفح الكامل المُرقّم.", "Search shows up to 100 results — clear it to browse the full paginated registry.")}
        </p>
      )}
    </AdminShell>
  );
}
