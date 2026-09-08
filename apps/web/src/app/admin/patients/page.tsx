"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { Patient } from "@/lib/types";

const DEBOUNCE_MS = 300;

export default function PatientsPage() {
  const user = useCurrentUser();
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Debounced so typing doesn't fire a request per keystroke (docs review
  // DCMS-011).
  useEffect(() => {
    const handle = setTimeout(() => setQuery(queryInput), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [queryInput]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false; // ignore a stale response that resolves after a newer one (DCMS-011)
    setLoading(true);
    setError(false);
    const path = query.trim() ? `/patients/search?q=${encodeURIComponent(query.trim())}` : "/patients";
    apiFetch(path)
      .then((data) => {
        if (cancelled) return;
        setPatients(data);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setPatients([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, query]);

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  return (
    <AdminShell user={user}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">سجل المرضى</h1>
        {user.permissions.includes("patient.create") && (
          <Link
            href="/admin/patients/new"
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            + إضافة مريض
          </Link>
        )}
      </div>

      <input
        type="text"
        placeholder="ابحث بالاسم، رقم الإضبارة، أو الهاتف..."
        value={queryInput}
        onChange={(e) => setQueryInput(e.target.value)}
        className="mt-4 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">الرقم</th>
              <th className="px-4 py-2 font-medium">الاسم</th>
              <th className="px-4 py-2 font-medium">رقم الإضبارة</th>
              <th className="px-4 py-2 font-medium">الهاتف</th>
              <th className="px-4 py-2 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  جاري التحميل...
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-red-600">
                  تعذر تحميل قائمة المرضى. تحقق من الاتصال وحاول مجدداً.
                </td>
              </tr>
            )}
            {!loading && !error && patients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  لا توجد نتائج
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              patients.map((patient) => (
                <tr key={patient.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/admin/patients/${patient.id}`} className="text-slate-800 hover:underline">
                      {patient.patientCode}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{patient.fullName}</td>
                  <td className="px-4 py-2">{patient.fileNumber ?? "-"}</td>
                  <td className="px-4 py-2">{patient.phone ?? "-"}</td>
                  <td className="px-4 py-2">{patient.status}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
