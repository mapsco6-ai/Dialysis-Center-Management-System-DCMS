"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { toast } from "@/components/Toaster";

interface Role { id: string; name: string; description: string | null; permissions: string[] }
interface PermissionGroup { module: string; permissions: { key: string; description: string | null }[] }

const inputClass = "rounded-md border border-border px-3 py-1.5 text-sm";

// Role x permission matrix. Edits are held locally per role and saved with
// one button per changed role, so the director sees exactly what changes
// (the API also refuses changes that would lock everyone out of RBAC).
export default function RolesMatrixPage() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const roles = useApi<Role[]>(user ? "/roles" : null);
  const groups = useApi<PermissionGroup[]>(user ? "/permissions/grouped" : null);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [newRole, setNewRole] = useState("");

  useEffect(() => {
    if (roles.data) setDraft(Object.fromEntries(roles.data.map((r) => [r.id, new Set(r.permissions)])));
  }, [roles.data]);

  if (!user) return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  const canEdit = user.permissions.includes("permission.manage");

  const changed = (role: Role) => {
    const now = draft[role.id];
    return Boolean(now) && (now.size !== role.permissions.length || role.permissions.some((p) => !now.has(p)));
  };
  const toggle = (role: Role, key: string) =>
    setDraft((d) => {
      const next = new Set(d[role.id]);
      next.has(key) ? next.delete(key) : next.add(key);
      return { ...d, [role.id]: next };
    });

  async function save(role: Role) {
    try {
      await apiFetch(`/roles/${role.id}/permissions`, { method: "PATCH", body: JSON.stringify({ permissionKeys: [...draft[role.id]] }) });
      toast.success(t(`تم حفظ صلاحيات ${role.name}`, `Saved permissions for ${role.name}`));
      roles.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر الحفظ", "Could not save"));
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/roles", { method: "POST", body: JSON.stringify({ name: newRole }) });
      setNewRole("");
      roles.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر الإنشاء", "Could not create"));
    }
  }

  async function remove(role: Role) {
    if (!window.confirm(t(`حذف الدور ${role.name}؟`, `Delete role ${role.name}?`))) return;
    try {
      await apiFetch(`/roles/${role.id}`, { method: "DELETE" });
      roles.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر الحذف", "Could not delete"));
    }
  }

  const list = roles.data ?? [];
  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">{t("مصفوفة الأدوار والصلاحيات", "Roles & permissions matrix")}</h1>
        <Link href="/admin/people/staff" className="text-sm text-muted underline">{t("← الموظفون", "← Staff")}</Link>
      </div>
      <p className="mt-1 text-sm text-muted">{t("عدّل الصلاحيات ثم احفظ كل دور. تسري التغييرات فوراً على الموظفين المعنيين.", "Edit permissions, then save each role. Changes apply immediately to the people holding it.")}</p>

      {canEdit && (
        <form onSubmit={create} className="mt-3 flex flex-wrap gap-2">
          <input className={inputClass} value={newRole} onChange={(e) => setNewRole(e.target.value.toUpperCase())} pattern="[A-Z][A-Z0-9_]{2,39}" required placeholder={t("دور جديد: ICU_NURSE", "New role: ICU_NURSE")} />
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">{t("إضافة دور", "Add role")}</button>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-start text-xs">
          <thead className="sticky top-0 bg-surface-secondary text-muted">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t("الصلاحية", "Permission")}</th>
              {list.map((role) => (
                <th key={role.id} className="px-2 py-2 font-medium">
                  <div>{role.name}</div>
                  {canEdit && changed(role) && <button type="button" onClick={() => save(role)} className="mt-1 rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">{t("حفظ", "Save")}</button>}
                  {canEdit && !["SUPER_ADMIN"].includes(role.name) && role.permissions.length === 0 && <button type="button" onClick={() => remove(role)} className="mt-1 block text-[10px] text-danger underline">{t("حذف", "Delete")}</button>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(groups.data ?? []).map((group) => (
              <FragmentRows key={group.module} group={group} roles={list} draft={draft} canEdit={canEdit} onToggle={toggle} />
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

function FragmentRows({ group, roles, draft, canEdit, onToggle }: { group: PermissionGroup; roles: Role[]; draft: Record<string, Set<string>>; canEdit: boolean; onToggle: (role: Role, key: string) => void }) {
  return (
    <>
      <tr className="bg-surface-secondary"><th colSpan={roles.length + 1} className="px-3 py-1 text-start text-[11px] uppercase tracking-wide text-muted">{group.module}</th></tr>
      {group.permissions.map((permission) => (
        <tr key={permission.key} className="border-t border-border">
          <td className="px-3 py-1" title={permission.description ?? undefined}><span className="font-mono">{permission.key}</span></td>
          {roles.map((role) => (
            <td key={role.id} className="px-2 py-1 text-center">
              <input type="checkbox" aria-label={`${role.name}: ${permission.key}`} checked={draft[role.id]?.has(permission.key) ?? false}
                disabled={!canEdit || role.name === "SUPER_ADMIN"} onChange={() => onToggle(role, permission.key)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
