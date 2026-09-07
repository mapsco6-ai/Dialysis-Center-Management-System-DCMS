"use client";

import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";

export default function AdminPage() {
  const user = useCurrentUser();

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">لوحة الإدارة</h1>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">مرحباً</p>
        <p className="text-lg font-medium text-slate-800">{user.fullName}</p>
        <p className="mt-2 text-sm text-slate-500">
          الأدوار: <span className="font-medium text-slate-700">{user.roles.join(", ")}</span>
        </p>
        <p className="mt-1 text-sm text-slate-500">
          عدد الصلاحيات: <span className="font-medium text-slate-700">{user.permissions.length}</span>
        </p>
      </div>
    </AdminShell>
  );
}
