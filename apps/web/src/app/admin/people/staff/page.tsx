"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { PaginatedTable, type TableColumn } from "@/components/PaginatedTable";
import { toast } from "@/components/Toaster";
import { Paginated } from "@/lib/types";

const PAGE_SIZE = 20;
// Same list the API seeds (packages/shared ROLES); used when the viewer may
// list staff but not read /roles (role.manage).
const BUILT_IN_ROLES = ["CENTER_DIRECTOR", "MEDICAL_DIRECTOR", "DOCTOR", "HEAD_NURSE", "NURSE", "PHARMACIST", "WAREHOUSE", "LAB_TECHNICIAN", "RECEPTION", "MAINTENANCE", "ACCOUNTANT", "AUDITOR"];

interface StaffMember {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  employeeNo: string | null;
  jobTitle: string | null;
  department: string | null;
  expiresAt: string | null;
  roles: string[];
}

const inputClass = "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const primaryButton = "rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";
const secondaryButton = "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";

function CreateStaff({ roleNames, onDone }: { roleNames: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ username: "", fullName: "", password: "", employeeNo: "", jobTitle: "", role: "" });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { role, ...rest } = form;
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({ ...rest, employeeNo: rest.employeeNo || undefined, jobTitle: rest.jobTitle || undefined, roleNames: [role] }),
      });
      toast.success(t("تمت إضافة الموظف. سيُطلب منه تغيير كلمة المرور عند أول دخول.", "Staff member added. They must change the password at first sign-in."));
      setForm({ username: "", fullName: "", password: "", employeeNo: "", jobTitle: "", role: "" });
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذرت الإضافة", "Could not add"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      <input required className={inputClass} placeholder={t("الاسم الكامل", "Full name")} value={form.fullName} onChange={set("fullName")} />
      <input required className={inputClass} placeholder={t("اسم المستخدم", "Username")} autoComplete="off" value={form.username} onChange={set("username")} />
      <input required minLength={8} type="text" className={inputClass} placeholder={t("كلمة مرور مؤقتة (8+)", "Temporary password (8+)")} autoComplete="off" value={form.password} onChange={set("password")} />
      <input className={inputClass} placeholder={t("الرقم الوظيفي", "Employee no.")} value={form.employeeNo} onChange={set("employeeNo")} />
      <input className={inputClass} placeholder={t("المسمى الوظيفي", "Job title")} value={form.jobTitle} onChange={set("jobTitle")} />
      <select required className={inputClass} value={form.role} onChange={set("role")} aria-label={t("الدور", "Role")}>
        <option value="">{t("اختر الدور…", "Choose role…")}</option>
        {roleNames.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <div className="sm:col-span-2 lg:col-span-3"><button type="submit" disabled={busy} className={primaryButton}>{t("إضافة الموظف", "Add staff member")}</button></div>
    </form>
  );
}

function StaffPanel({ member, roleNames, canEdit, onChanged, onClose }: { member: StaffMember; roleNames: string[]; canEdit: boolean; onChanged: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const detail = useApi<{ permissions: string[]; roles: string[] }>(`/users/${member.id}`);
  const [roles, setRoles] = useState<string[]>(member.roles);
  const [reason, setReason] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function act(label: string, path: string, options: RequestInit) {
    try {
      const result = await apiFetch(path, options);
      toast.success(label);
      onChanged();
      detail.refresh();
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر تنفيذ الإجراء", "Action failed"));
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-300 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{member.fullName}</h2>
          <p className="text-xs text-slate-500">{member.username} · {member.isActive ? t("نشط", "Active") : t("معطّل", "Deactivated")}</p>
        </div>
        <button className={secondaryButton} onClick={onClose}>{t("إغلاق", "Close")}</button>
      </div>

      {canEdit && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-600">{t("الأدوار", "Roles")}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {roleNames.map((name) => (
                <label key={name} className="flex items-center gap-1 rounded-full border border-slate-300 px-2 py-1 text-xs">
                  <input type="checkbox" checked={roles.includes(name)} onChange={(e) => setRoles(e.target.checked ? [...roles, name] : roles.filter((r) => r !== name))} />
                  {name}
                </label>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input className={`${inputClass} flex-1`} placeholder={t("سبب التغيير (إلزامي)", "Reason for change (required)")} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className={primaryButton} disabled={!reason.trim() || roles.length === 0}
                onClick={() => act(t("تم تحديث الأدوار", "Roles updated"), `/users/${member.id}/roles`, { method: "PUT", body: JSON.stringify({ roleNames: roles, reason }) }).then(() => setReason(""))}>
                {t("حفظ", "Save")}
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-600">{t("إجراءات الحساب", "Account actions")}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={secondaryButton}
                onClick={async () => { const r = await act(t("تم تصفير كلمة المرور", "Password reset"), `/users/${member.id}/reset-password`, { method: "POST" }); if (r) setTempPassword(r.temporaryPassword); }}>
                {t("إعادة تعيين كلمة المرور", "Reset password")}
              </button>
              <button className={secondaryButton} onClick={() => act(t("تم تصفير الـ PIN", "PIN reset"), `/users/${member.id}/reset-pin`, { method: "POST" })}>{t("تصفير PIN", "Reset PIN")}</button>
              {member.isActive ? (
                <button className={secondaryButton} onClick={() => { const why = window.prompt(t("سبب التعطيل؟", "Reason for deactivation?")); if (why) act(t("تم التعطيل", "Deactivated"), `/users/${member.id}/deactivate`, { method: "PATCH", body: JSON.stringify({ reason: why }) }); }}>{t("تعطيل الحساب", "Deactivate")}</button>
              ) : (
                <button className={secondaryButton} onClick={() => act(t("تم التفعيل", "Activated"), `/users/${member.id}/activate`, { method: "PATCH" })}>{t("إعادة التفعيل", "Activate")}</button>
              )}
              <Link className={secondaryButton} href={`/admin/governance/audit?actorId=${member.id}`}>{t("سجل نشاطه", "Activity log")}</Link>
            </div>
            {tempPassword && (
              <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                {t("كلمة المرور المؤقتة (تظهر مرة واحدة): ", "Temporary password (shown once): ")}<bdi className="font-mono font-semibold">{tempPassword}</bdi>
              </p>
            )}
          </div>
        </div>
      )}

      <h3 className="mt-4 text-sm font-semibold text-slate-600">{t("الصلاحيات الفعلية", "Effective permissions")}</h3>
      <p className="mt-1 text-xs leading-6 text-slate-500" dir="ltr">{detail.data?.permissions.join(" · ") || "…"}</p>
    </div>
  );
}

export default function StaffPage() {
  const { t, formatDate } = useI18n();
  const user = useCurrentUser();
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(queryInput), 300);
    return () => clearTimeout(handle);
  }, [queryInput]);
  useEffect(() => setPage(1), [query, role]);

  const list = useApi<Paginated<StaffMember>>(
    user ? `/users?page=${page}&limit=${PAGE_SIZE}${query ? `&search=${encodeURIComponent(query)}` : ""}${role ? `&role=${role}` : ""}` : null,
  );
  const canManageRoles = Boolean(user?.permissions.includes("role.manage"));
  const roles = useApi<{ name: string }[]>(canManageRoles ? "/roles" : null);
  const roleNames = roles.data ? roles.data.map((r) => r.name).filter((n) => n !== "SUPER_ADMIN") : BUILT_IN_ROLES;

  if (!user) return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;

  const columns: TableColumn<StaffMember>[] = [
    { key: "fullName", header: t("الموظف", "Staff member"), render: (m) => <><span className="font-medium">{m.fullName}</span><br /><span className="text-xs text-slate-500">{m.username}{m.employeeNo ? ` · ${m.employeeNo}` : ""}</span></> },
    { key: "roles", header: t("الأدوار", "Roles"), render: (m) => m.roles.join("، ") },
    { key: "jobTitle", header: t("المسمى", "Title"), render: (m) => m.jobTitle ?? "-" },
    { key: "lastLoginAt", header: t("آخر دخول", "Last sign-in"), render: (m) => (m.lastLoginAt ? formatDate(m.lastLoginAt) : "-") },
    { key: "isActive", header: t("الحالة", "Status"), render: (m) => (m.isActive ? t("نشط", "Active") : t("معطّل", "Deactivated")) },
    { key: "actions", header: "", render: (m) => <button className={secondaryButton} onClick={() => setSelected(m)}>{t("إدارة", "Manage")}</button> },
  ];

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">{t("الموظفون", "Staff")}</h1>
        <div className="flex gap-2">
          {user.permissions.includes("role.manage") && <Link href="/admin/people/staff/roles" className={secondaryButton}>{t("مصفوفة الصلاحيات", "Permissions matrix")}</Link>}
          {user.permissions.includes("user.create") && <button className={primaryButton} onClick={() => setShowCreate(!showCreate)}>{t("+ إضافة موظف", "+ Add staff member")}</button>}
        </div>
      </div>

      {showCreate && <CreateStaff roleNames={roleNames} onDone={() => { setShowCreate(false); list.refresh(); }} />}

      <div className="mt-4 flex flex-wrap gap-2">
        <input className={`${inputClass} w-full max-w-xs`} placeholder={t("ابحث بالاسم أو اسم المستخدم أو الرقم الوظيفي…", "Search name, username or employee no…")} value={queryInput} onChange={(e) => setQueryInput(e.target.value)} />
        <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} aria-label={t("فلترة حسب الدور", "Filter by role")}>
          <option value="">{t("كل الأدوار", "All roles")}</option>
          {roleNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {selected && <StaffPanel key={selected.id} member={selected} roleNames={roleNames} canEdit={user.permissions.includes("user.edit")}
        onChanged={() => list.refresh()} onClose={() => setSelected(null)} />}

      <div className="mt-4">
        <PaginatedTable columns={columns} rows={list.data?.data ?? null} total={list.data?.total ?? null} page={page} pageSize={PAGE_SIZE}
          onPageChange={setPage} loading={list.loading} error={list.error} onRetry={list.refresh}
          emptyTitle={t("لا يوجد موظفون مطابقون", "No matching staff")} rowKey={(m) => m.id} />
      </div>
    </AdminShell>
  );
}
