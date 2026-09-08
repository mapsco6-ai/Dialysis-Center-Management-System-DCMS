"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";
import { AuthenticatedUser } from "@/lib/types";

export function AdminShell({
  user,
  children,
}: {
  user: AuthenticatedUser;
  children: React.ReactNode;
}) {
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="font-semibold text-slate-800">
              DCMS
            </Link>
            {user.permissions.includes("patient.view") && (
              <Link href="/admin/patients" className="text-slate-600 hover:text-slate-900">
                المرضى
              </Link>
            )}
            {(user.permissions.includes("scheduling.manage") || user.permissions.includes("attendance.checkin")) && (
              <Link href="/admin/schedule" className="text-slate-600 hover:text-slate-900">
                الجدول اليومي
              </Link>
            )}
            {user.permissions.includes("attendance.checkin") && (
              <Link href="/admin/reception" className="text-slate-600 hover:text-slate-900">
                الاستقبال
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">{user.fullName}</span>
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-100"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
