"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { clearToken, apiFetch, ApiError } from "@/lib/api";
import { clearCurrentUser } from "@/lib/useCurrentUser";
import { toast } from "./Toaster";
import { NotificationBell } from "./NotificationBell";
import { useI18n } from "@/lib/i18n";
import type { AuthenticatedUser } from "@/lib/types";
import { CenterMark, WorkspaceIcon, type IconName } from "./WorkspaceIcon";

type NavGroup = "overview" | "care" | "facility" | "governance" | "people";
const GROUPS: { key: NavGroup; ar: string; en: string }[] = [
  { key: "overview", ar: "نظرة عامة", en: "Overview" },
  { key: "care", ar: "رعاية المرضى", en: "Patient care" },
  { key: "facility", ar: "المنشأة والموارد", en: "Facility & supplies" },
  { key: "governance", ar: "الجودة والرقابة", en: "Quality & oversight" },
  { key: "people", ar: "الموظفون", en: "People" },
];
type NavigationItem = { href: string; ar: string; en: string; icon: IconName; permissions?: string[]; group: NavGroup };
const navigation: NavigationItem[] = [
  { href: "/admin", ar: "لوحة المركز", en: "Dashboard", icon: "dashboard", group: "overview" },
  { href: "/admin/care/flow", ar: "رحلة المرضى اليوم", en: "Patient flow", icon: "nursing", group: "care", permissions: ["scheduling.manage", "attendance.checkin", "dialysis.session.view", "nursing.ward.view"] },
  { href: "/admin/care/appointments", ar: "الجدول اليومي", en: "Appointments", icon: "calendar", group: "care", permissions: ["scheduling.manage", "attendance.checkin"] },
  { href: "/admin/care/patients", ar: "المرضى", en: "Patients", icon: "patients", group: "care", permissions: ["patient.view"] },
  { href: "/admin/care/reception", ar: "الاستقبال", en: "Reception", icon: "reception", group: "care", permissions: ["attendance.checkin"] },
  { href: "/admin/care/nursing", ar: "التمريض", en: "Nursing", icon: "nursing", group: "care", permissions: ["nursing.ward.view", "nursing.assign"] },
  { href: "/admin/care/doctor", ar: "الطبيب", en: "Doctor", icon: "doctor", group: "care", permissions: ["prescription.create", "prescription.modify", "medication.administer"] },
  { href: "/admin/care/lab", ar: "المختبر", en: "Laboratory", icon: "lab", group: "care", permissions: ["lab.queue.view", "lab.result.create", "lab.catalog.manage"] },
  { href: "/admin/care/pharmacy", ar: "الصيدلية", en: "Pharmacy", icon: "pharmacy", group: "care", permissions: ["pharmacy.dispense"] },
  { href: "/admin/governance/reports", ar: "التقارير", en: "Reports", icon: "reports", group: "governance", permissions: ["patient.view", "scheduling.manage", "dialysis.session.view", "machine.view", "maintenance.manage", "inventory.view", "pharmacy.dispense", "lab.queue.view"] },
  { href: "/admin/facility/inventory", ar: "المخزون", en: "Inventory", icon: "inventory", group: "facility", permissions: ["inventory.view", "inventory.manage"] },
  { href: "/admin/facility/machines", ar: "الأجهزة", en: "Machines", icon: "machines", group: "facility", permissions: ["machine.view", "machine.assign", "approval.machine.decide"] },
  { href: "/admin/facility/maintenance", ar: "الصيانة", en: "Maintenance", icon: "maintenance", group: "facility", permissions: ["machine.fault.report", "maintenance.manage", "machine.view"] },
  { href: "/admin/governance/oversight", ar: "لوحة الرقابة", en: "Oversight", icon: "dashboard", group: "overview", permissions: ["oversight.view"] },
  { href: "/admin/people/entries", ar: "تقاريري وإجراءاتي", en: "Reports & actions", icon: "reports", group: "people", permissions: ["entry.create", "entry.review"] },
  { href: "/admin/people/staff", ar: "الموظفون", en: "Staff", icon: "patients", group: "people", permissions: ["user.view"] },
  { href: "/admin/governance/audit", ar: "سجل التدقيق", en: "Audit trail", icon: "quality", group: "governance", permissions: ["audit.view"] },
  { href: "/admin/governance/quality", ar: "الجودة والسلامة", en: "Quality & safety", icon: "quality", group: "governance", permissions: ["incident.report", "incident.view", "incident.review", "quality.audit.view"] },
];

export function AdminShell({ user, children }: { user: AuthenticatedUser; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale, setLocale, theme, setTheme } = useI18n();
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcutHint, setShortcutHint] = useState("Ctrl K");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcutHint("⌘K");
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const [patientResults, setPatientResults] = useState<{ id: string; patientCode: string; fullName: string }[]>([]);
  // Ctrl+K doubles as a global patient finder (V1.1 §2.2): once two
  // characters are typed, matching patients appear above the section list
  // and open their medical file directly - the registry's search endpoint,
  // debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (!user.permissions.includes("patient.view") || search.trim().length < 2) {
      setPatientResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch(`/patients/search?q=${encodeURIComponent(search.trim())}`)
        .then((data) => { if (!cancelled) setPatientResults(data.slice(0, 6)); })
        .catch(() => { if (!cancelled) setPatientResults([]); });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, user.permissions]);
  // The committee account (oversight only) has no use for the operational dashboard.
  const oversightOnly = user.permissions.length === 1 && user.permissions[0] === "oversight.view";
  const allowed = navigation.filter((item) => (item.href !== "/admin" || !oversightOnly) && (!item.permissions || item.permissions.some((p) => user.permissions.includes(p))));
  const visible = allowed.filter((item) => `${item.ar} ${item.en}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const isActive = (href: string) => href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const active = allowed.find((item) => isActive(item.href));
  // Section the URL points at, even when this user may not open it.
  const requested = navigation.find((item) => item.href !== "/admin" && isActive(item.href));
  const forbidden = Boolean(requested && !allowed.includes(requested));
  const title = pathname.startsWith("/admin/settings") ? t("الإعدادات", "Settings")
    : pathname.startsWith("/admin/care/sessions") ? t("جلسة الديلزة", "Dialysis session")
    : active ? t(active.ar, active.en) : t("مساحة العمل", "Workspace");
  // Browser tab / history / screen-reader title follows the section.
  useEffect(() => {
    document.title = `${title} — DCMS`;
  }, [title]);
  const initials = user.fullName.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("");

  async function logout() {
    try {
      await apiFetch("/auth/sessions/current", { method: "DELETE" });
    } catch (error) {
      // The super admin can make shift reports mandatory: the API refuses the
      // sign-out until one is filed, so send the user to write it.
      if (error instanceof ApiError && error.code === "SHIFT_REPORT_REQUIRED") {
        toast.error(t("يجب تقديم تقرير الدوام قبل تسجيل الخروج", "Submit your shift report before signing out"));
        router.push("/admin/people/entries");
        return;
      }
    }
    clearToken();
    clearCurrentUser();
    router.push("/login");
  }

  return (
    <div className="workspace">
      <a className="skip-link" href="#workspace-main">{t("انتقل إلى المحتوى", "Skip to content")}</a>
      <aside id="workspace-navigation" className={`workspace-sidebar ${menuOpen ? "is-open" : ""}`}
        onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
        <Link href="/admin" className="workspace-brand" onClick={() => setMenuOpen(false)}>
          <CenterMark /><span>DCMS<span className="brand-caption">{t("مركز رعاية الكلى", "Kidney care center")}</span></span>
        </Link>
        <div className="sidebar-scroll">
          <label className="navigation-search">
            <WorkspaceIcon name="search" width={15} height={15} />
            <input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder={t("ابحث في الأقسام...", "Find a section...")} aria-label={t("ابحث في أقسام النظام", "Search navigation")} />
            {!search && <kbd className="navigation-search-hint">{shortcutHint}</kbd>}
          </label>
          <nav aria-label={t("القائمة الرئيسية", "Main navigation")}>
            {GROUPS.map(({ key: group, ar, en }) => {
              const items = visible.filter((item) => item.group === group);
              if (!items.length) return null;
              return <div className="navigation-group" key={group}>
                <p className="navigation-heading">{t(ar, en)}</p>
                {items.map((item) => <Link key={item.href} href={item.href} className={`navigation-link ${isActive(item.href) ? "is-active" : ""}`}
                  aria-current={isActive(item.href) ? "page" : undefined} onClick={() => { setMenuOpen(false); setSearch(""); }}>
                  <WorkspaceIcon name={item.icon} /><span>{t(item.ar, item.en)}</span>
                </Link>)}
              </div>;
            })}
            {patientResults.length > 0 && (
              <div className="navigation-group">
                <p className="navigation-heading">{t("المرضى", "Patients")}</p>
                {patientResults.map((patient) => (
                  <Link key={patient.id} href={`/admin/care/patients/${patient.id}`} className="navigation-link"
                    onClick={() => { setMenuOpen(false); setSearch(""); }}>
                    <WorkspaceIcon name="patients" /><span>{patient.fullName} — {patient.patientCode}</span>
                  </Link>
                ))}
              </div>
            )}
            {visible.length === 0 && patientResults.length === 0 && <p className="navigation-empty">{t("لا يوجد قسم مطابق للبحث", "No matching sections")}</p>}
          </nav>
        </div>
        <div className="sidebar-footer">
          <Link href="/admin/settings" className={`navigation-link ${pathname.startsWith("/admin/settings") ? "is-active" : ""}`}
            aria-current={pathname.startsWith("/admin/settings") ? "page" : undefined} onClick={() => setMenuOpen(false)}>
            <WorkspaceIcon name="settings" /><span>{t("الإعدادات", "Settings")}</span>
          </Link>
          <div className="sidebar-theme"><span><WorkspaceIcon name={theme === "dark" ? "moon" : "sun"} />{t("المظهر", "Theme")}</span>
            <div className="theme-switcher" role="group" aria-label={t("المظهر", "Theme")}>
              <Button isIconOnly size="sm" variant="ghost" aria-label={t("المظهر الفاتح", "Light theme")} aria-pressed={theme === "light"} onPress={() => setTheme("light")}><WorkspaceIcon name="sun" width={15} height={15} /></Button>
              <Button isIconOnly size="sm" variant="ghost" aria-label={t("المظهر الداكن", "Dark theme")} aria-pressed={theme === "dark"} onPress={() => setTheme("dark")}><WorkspaceIcon name="moon" width={15} height={15} /></Button>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div className="topbar-location">
            <Button className="mobile-menu-button" variant="ghost" isIconOnly size="sm" aria-label={t("القائمة الرئيسية", "Main navigation")}
              aria-expanded={menuOpen} aria-controls="workspace-navigation" onPress={() => setMenuOpen(!menuOpen)}><WorkspaceIcon name={menuOpen ? "close" : "menu"} /></Button>
            <span className="topbar-title">{title}</span>
          </div>
          <div className="topbar-actions">
            <NotificationBell />
            <Button variant="ghost" size="sm" className="language-button" onPress={() => setLocale(locale === "ar" ? "en" : "ar")}
              aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}><WorkspaceIcon name="language" width={16} height={16} /><span lang={locale === "ar" ? "en" : "ar"}>{locale === "ar" ? "English" : "العربية"}</span></Button>
            <span className="topbar-divider" />
            <details className="account-menu">
              <summary><span className="account-avatar" aria-hidden="true">{initials}</span><bdi className="account-name">{user.fullName}</bdi><WorkspaceIcon name="chevron" width={13} height={13} /></summary>
              <div className="account-panel"><span className="account-username" dir="auto">{user.username}</span>
                <Link href="/admin/settings">{t("إعدادات الحساب", "Account settings")}</Link>
                <Button variant="ghost" size="sm" onPress={logout}><WorkspaceIcon name="logout" />{t("تسجيل الخروج", "Sign out")}</Button>
              </div>
            </details>
          </div>
        </header>
        <main id="workspace-main" tabIndex={-1} className={`workspace-content ${pathname === "/admin/settings" ? "settings-content" : ""}`}>
          {user.mustChangePassword && pathname !== "/admin/settings" && <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            {t("كلمة مرورك مؤقتة. ", "Your password is temporary. ")}<Link href="/admin/settings" className="font-medium underline">{t("غيّرها الآن", "Change it now")}</Link>
          </div>}
          {forbidden ? (
            <div role="alert" className="mx-auto mt-16 max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
              <h1 className="text-lg font-semibold text-slate-800">{t("غير مصرّح بالدخول", "Access denied")}</h1>
              <p className="mt-2 text-sm text-slate-500">{t("ليس لديك صلاحية لفتح هذا القسم. تواصل مع مسؤول النظام إن كنت تحتاجه.", "You do not have permission to open this section. Ask your administrator if you need it.")}</p>
              <Link href={user.landingPath ?? "/admin"} className="mt-4 inline-block rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white">{t("العودة إلى مساحتي", "Back to my workspace")}</Link>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  );
}
