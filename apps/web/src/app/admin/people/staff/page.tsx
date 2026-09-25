"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { labelOf, PERMISSION_LABELS, ROLE_LABELS } from "@/lib/labels";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { FilterSelect } from "@/components/FilterSelect";
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
  passwordResetRequestedAt: string | null;
  roles: string[];
}

const inputClass = "rounded-md border border-border px-3 py-2 text-sm focus:border-border0 focus:outline-none";
const primaryButton = "rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50";
const secondaryButton = "rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-secondary";

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
    <form onSubmit={submit} className="mt-4 grid gap-2 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
      <input required className={inputClass} placeholder={t("الاسم الكامل", "Full name")} value={form.fullName} onChange={set("fullName")} />
      <input required className={inputClass} placeholder={t("اسم المستخدم", "Username")} autoComplete="off" value={form.username} onChange={set("username")} />
      <input required minLength={8} type="text" className={inputClass} placeholder={t("كلمة مرور مؤقتة (8+)", "Temporary password (8+)")} autoComplete="off" value={form.password} onChange={set("password")} />
      <input className={inputClass} placeholder={t("الرقم الوظيفي", "Employee no.")} value={form.employeeNo} onChange={set("employeeNo")} />
      <input className={inputClass} placeholder={t("المسمى الوظيفي", "Job title")} value={form.jobTitle} onChange={set("jobTitle")} />
      <FilterSelect
        required
        className="w-full"
        aria-label={t("الدور", "Role")}
        value={form.role}
        onChange={(role) => setForm({ ...form, role })}
        placeholder={t("اختر الدور…", "Choose role…")}
        options={roleNames.map((name) => ({ id: name, label: labelOf(ROLE_LABELS, name, t) }))}
      />
      <div className="sm:col-span-2 lg:col-span-3"><button type="submit" disabled={busy} className={primaryButton}>{t("إضافة الموظف", "Add staff member")}</button></div>
    </form>
  );
}

// Shared by both targeting modes - a named employee (target.assignedToId) or
// a whole role (target.assignedToRoleId) - so the manager's routing decision
// is a prop, not two near-duplicate forms.
function TaskForm({ target, targetLabel, onDone, onCancel }: { target: { assignedToId: string } | { assignedToRoleId: string }; targetLabel: string; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ title: "", description: "", dueAt: "", priority: "NORMAL" });
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          ...target,
          title: form.title,
          description: form.description || undefined,
          dueAt: form.dueAt || undefined,
          priority: form.priority,
        }),
      });
      toast.success(t("تم إسناد المهمة", "Task assigned"));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر إسناد المهمة", "Could not assign the task"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 rounded-md border border-border bg-surface-secondary p-3 sm:grid-cols-2">
      <p className="text-xs font-medium text-muted sm:col-span-2">{t("مهمة إلى: ", "Task to: ")}{targetLabel}</p>
      <input required className={`${inputClass} sm:col-span-2`} placeholder={t("عنوان المهمة", "Task title")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input className={`${inputClass} sm:col-span-2`} placeholder={t("تفاصيل (اختياري)", "Details (optional)")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <input type="datetime-local" className={inputClass} value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} aria-label={t("الموعد النهائي", "Due date")} />
      <FilterSelect
        className="w-full"
        aria-label={t("الأولوية", "Priority")}
        value={form.priority}
        onChange={(priority) => setForm({ ...form, priority })}
        options={[
          { id: "LOW", label: t("منخفضة", "Low") },
          { id: "NORMAL", label: t("عادية", "Normal") },
          { id: "HIGH", label: t("عالية", "High") },
          { id: "URGENT", label: t("عاجلة", "Urgent") },
        ]}
      />
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={busy} className={primaryButton}>{t("إسناد", "Assign")}</button>
        <button type="button" className={secondaryButton} onClick={onCancel}>{t("إلغاء", "Cancel")}</button>
      </div>
    </form>
  );
}

function StaffPanel({ member, roleNames, canEdit, onChanged, onClose }: { member: StaffMember; roleNames: string[]; canEdit: boolean; onChanged: () => void; onClose: () => void }) {
  const { t, formatDate } = useI18n();
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
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{member.fullName}</h2>
          <p className="text-xs text-muted">{member.username} · {member.isActive ? t("نشط", "Active") : t("معطّل", "Deactivated")}</p>
        </div>
        <button className={secondaryButton} onClick={onClose}>{t("إغلاق", "Close")}</button>
      </div>

      {member.passwordResetRequestedAt && !tempPassword && (
        <p role="alert" className="mt-3 rounded-md border border-danger bg-surface-secondary px-3 py-2 text-sm text-danger">
          {t("طلب هذا المستخدم إعادة تعيين كلمة المرور في ", "This user requested a password reset on ")}{formatDate(member.passwordResetRequestedAt)}.{" "}
          {t("اضغط «إعادة تعيين كلمة المرور» للموافقة وسلّمه كلمة المرور المؤقتة.", "Click “Reset password” to approve, then hand them the temporary password.")}
        </p>
      )}

      {canEdit && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-muted">{t("الأدوار", "Roles")}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {roleNames.map((name) => (
                <label key={name} className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs">
                  <input type="checkbox" checked={roles.includes(name)} onChange={(e) => setRoles(e.target.checked ? [...roles, name] : roles.filter((r) => r !== name))} />
                  {labelOf(ROLE_LABELS, name, t)}
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
            <h3 className="text-sm font-semibold text-muted">{t("إجراءات الحساب", "Account actions")}</h3>
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
              <p role="alert" className="mt-2 rounded-md border border-danger bg-surface-secondary px-3 py-2 text-sm text-danger">
                {t("كلمة المرور المؤقتة (تظهر مرة واحدة): ", "Temporary password (shown once): ")}<bdi className="font-mono font-semibold">{tempPassword}</bdi>
              </p>
            )}
          </div>
        </div>
      )}

      <h3 className="mt-4 text-sm font-semibold text-muted">{t("الصلاحيات الفعلية", "Effective permissions")}</h3>
      <p className="mt-1 text-xs leading-6 text-muted">{detail.data?.permissions.map((key) => labelOf(PERMISSION_LABELS, key, t)).join(" · ") || "…"}</p>
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
  const [taskTargetMember, setTaskTargetMember] = useState<StaffMember | null>(null);
  const [routingToRole, setRoutingToRole] = useState(false);
  const [taskRoleId, setTaskRoleId] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setQuery(queryInput), 300);
    return () => clearTimeout(handle);
  }, [queryInput]);
  useEffect(() => setPage(1), [query, role]);
  // Opened from a password-reset-request notification (?user=<id>).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("user");
    if (id) apiFetch(`/users/${id}`).then(setSelected).catch(() => {});
  }, []);

  const list = useApi<Paginated<StaffMember>>(
    user ? `/users?page=${page}&limit=${PAGE_SIZE}${query ? `&search=${encodeURIComponent(query)}` : ""}${role ? `&role=${role}` : ""}` : null,
  );
  const canManageRoles = Boolean(user?.permissions.includes("role.manage"));
  const roles = useApi<{ name: string }[]>(canManageRoles ? "/roles" : null);
  const roleNames = roles.data ? roles.data.map((r) => r.name).filter((n) => n !== "SUPER_ADMIN") : BUILT_IN_ROLES;
  const canCreateTask = Boolean(user?.permissions.includes("task.create"));
  const routableRoles = useApi<{ id: string; name: string }[]>(canCreateTask ? "/tasks/routable-roles" : null);

  if (!user) return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;

  const columns: TableColumn<StaffMember>[] = [
    { key: "fullName", header: t("الموظف", "Staff member"), render: (m) => <><span className="font-medium">{m.fullName}</span><br /><span className="text-xs text-muted">{m.username}{m.employeeNo ? ` · ${m.employeeNo}` : ""}</span></> },
    { key: "roles", header: t("الأدوار", "Roles"), render: (m) => m.roles.map((r) => labelOf(ROLE_LABELS, r, t)).join(t("، ", ", ")) },
    { key: "jobTitle", header: t("المسمى", "Title"), render: (m) => m.jobTitle ?? "-" },
    { key: "lastLoginAt", header: t("آخر دخول", "Last sign-in"), render: (m) => (m.lastLoginAt ? formatDate(m.lastLoginAt) : "-") },
    { key: "isActive", header: t("الحالة", "Status"), render: (m) => (
      <>
        {m.isActive ? t("نشط", "Active") : t("معطّل", "Deactivated")}
        {m.passwordResetRequestedAt && <><br /><span className="text-xs font-medium text-danger">{t("طلب إعادة تعيين كلمة المرور", "Password reset requested")}</span></>}
      </>
    ) },
    { key: "actions", header: "", render: (m) => (
      <div className="flex gap-2">
        <button className={secondaryButton} onClick={() => setSelected(m)}>{t("إدارة", "Manage")}</button>
        {canCreateTask && <button className={secondaryButton} onClick={() => setTaskTargetMember(m)}>{t("إسناد مهمة", "Assign task")}</button>}
      </div>
    ) },
  ];

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">{t("الموظفون", "Staff")}</h1>
        <div className="flex gap-2">
          {user.permissions.includes("role.manage") && <Link href="/admin/people/staff/roles" className={secondaryButton}>{t("مصفوفة الصلاحيات", "Permissions matrix")}</Link>}
          {canCreateTask && <button className={secondaryButton} onClick={() => setRoutingToRole(!routingToRole)}>{t("+ توجيه مهمة لدور", "+ Route task to a role")}</button>}
          {user.permissions.includes("user.create") && <button className={primaryButton} onClick={() => setShowCreate(!showCreate)}>{t("+ إضافة موظف", "+ Add staff member")}</button>}
        </div>
      </div>

      {showCreate && <CreateStaff roleNames={roleNames} onDone={() => { setShowCreate(false); list.refresh(); }} />}

      {routingToRole && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4">
          <FilterSelect
            className="w-full"
            aria-label={t("الدور المستهدف", "Target role")}
            value={taskRoleId}
            onChange={setTaskRoleId}
            placeholder={t("اختر الدور…", "Choose role…")}
            options={(routableRoles.data ?? []).map((r) => ({ id: r.id, label: labelOf(ROLE_LABELS, r.name, t) }))}
          />
          {taskRoleId && (
            <TaskForm
              target={{ assignedToRoleId: taskRoleId }}
              targetLabel={labelOf(ROLE_LABELS, routableRoles.data?.find((r) => r.id === taskRoleId)?.name ?? "", t)}
              onDone={() => { setRoutingToRole(false); setTaskRoleId(""); }}
              onCancel={() => setTaskRoleId("")}
            />
          )}
        </div>
      )}

      {taskTargetMember && (
        <TaskForm
          target={{ assignedToId: taskTargetMember.id }}
          targetLabel={taskTargetMember.fullName}
          onDone={() => setTaskTargetMember(null)}
          onCancel={() => setTaskTargetMember(null)}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <input className={`${inputClass} w-full max-w-xs`} placeholder={t("ابحث بالاسم أو اسم المستخدم أو الرقم الوظيفي…", "Search name, username or employee no…")} value={queryInput} onChange={(e) => setQueryInput(e.target.value)} />
        <FilterSelect
          className="min-w-[10rem]"
          aria-label={t("فلترة حسب الدور", "Filter by role")}
          value={role}
          onChange={setRole}
          options={[
            { id: "", label: t("كل الأدوار", "All roles") },
            ...roleNames.map((name) => ({ id: name, label: labelOf(ROLE_LABELS, name, t) })),
          ]}
        />
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
