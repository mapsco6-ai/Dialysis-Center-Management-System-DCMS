"use client";

import { Description, Label, Switch, Tabs } from "@heroui/react";
import { AdminShell } from "@/components/AdminShell";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useI18n } from "@/lib/i18n";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, clearToken } from "@/lib/api";
import { toast } from "@/components/Toaster";

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="settings-section"><div className="settings-section-intro"><h2>{title}</h2><p>{description}</p></div><div className="settings-section-fields">{children}</div></section>;
}

function PreferenceSwitch({ title, description, selected, onChange }: { title: string; description: string; selected: boolean; onChange: (selected: boolean) => void }) {
  const { t } = useI18n();
  return <div className="preference-row">
    <Switch size="sm" isSelected={selected} onChange={onChange} className="preference-switch">
      <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control><Label>{title}</Label></Switch.Content>
      <Description>{description}</Description>
    </Switch>
    <span className="preference-value">{selected ? t("مفعّل", "Enabled") : t("متوقف", "Disabled")}</span>
  </div>;
}

function LanguageSettings() {
  const { t, locale, setLocale, formatDate, formatNumber } = useI18n();
  return <>
    <SettingsSection title={t("لغة النظام", "System language")} description={t("اختر اللغة المستخدمة في القوائم والنماذج والتقارير المعروضة.", "Choose the language for navigation, forms and on-screen reports.")}>
      <div className="preference-row"><div><label htmlFor="interface-language" className="preference-label">{t("لغة الواجهة", "Interface language")}</label><p className="preference-description">{t("تُطبّق مباشرة على جميع أقسام النظام.", "Applies immediately across your workspace.")}</p></div>
        <select id="interface-language" value={locale} onChange={(event) => setLocale(event.target.value === "en" ? "en" : "ar")} className="preference-select"><option value="ar" lang="ar">العربية</option><option value="en" lang="en">English</option></select>
      </div>
      <div className="preference-row"><div><span className="preference-label">{t("اتجاه العرض", "Layout direction")}</span><p className="preference-description">{t("يتبع اللغة المختارة تلقائياً.", "Automatically follows your selected language.")}</p></div><span className="preference-value">{t("من اليمين إلى اليسار", "Left to right")}</span></div>
    </SettingsSection>
    <SettingsSection title={t("تنسيق العرض", "Regional format")} description={t("عرض التواريخ والأرقام حسب لغة الواجهة.", "Dates and numbers are formatted for your interface language.")}>
      <div className="preference-row"><span className="preference-label">{t("مثال على التاريخ", "Date preview")}</span><span className="preference-value">{formatDate("2026-09-11T12:00:00Z", { year: "numeric", month: "long", day: "numeric" })}</span></div>
      <div className="preference-row"><span className="preference-label">{t("مثال على الأرقام", "Number preview")}</span><span className="preference-value">{formatNumber(1234.5, { minimumFractionDigits: 2 })}</span></div>
    </SettingsSection>
  </>;
}

function ChangePassword() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/me/password", { method: "PUT", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      // The API invalidates every session on a password change.
      clearToken();
      window.location.href = "/login";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر تغيير كلمة المرور", "Could not change password"));
    }
  }
  return <SettingsSection title={t("تغيير كلمة المرور", "Change password")} description={t("بعد التغيير ستحتاج إلى تسجيل الدخول من جديد.", "You will need to sign in again afterwards.")}>
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-2">
      <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder={t("كلمة المرور الحالية", "Current password")} className="rounded-md border border-border px-3 py-2 text-sm" />
      <input type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder={t("كلمة المرور الجديدة (8 أحرف على الأقل)", "New password (min 8 characters)")} className="rounded-md border border-border px-3 py-2 text-sm" />
      <button type="submit" className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">{t("تغيير", "Change")}</button>
    </form>
  </SettingsSection>;
}

interface SettingRow { key: string; value: unknown; description: string }

// Super-admin switches + the audit-trail integrity check.
function SystemSettings({ canManage, canAudit }: { canManage: boolean; canAudit: boolean }) {
  const { t, formatNumber, formatDate } = useI18n();
  const [settings, setSettings] = useState<SettingRow[] | null>(null);
  const [years, setYears] = useState("10");
  const [integrity, setIntegrity] = useState<{ ok: boolean; checked: number; brokenAtSeq?: number; reason?: string } | null>(null);
  const [retention, setRetention] = useState<{ retentionYears: number; total: number; olderThanCutoff: number; oldestAt: string | null } | null>(null);

  useEffect(() => {
    if (!canManage) return;
    apiFetch("/settings").then((rows: SettingRow[]) => {
      setSettings(rows);
      setYears(String(rows.find((r) => r.key === "auditRetentionYears")?.value ?? 10));
    }).catch(() => setSettings([]));
  }, [canManage]);

  async function save(key: string, value: unknown) {
    try {
      await apiFetch(`/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
      setSettings((rows) => rows?.map((r) => (r.key === key ? { ...r, value } : r)) ?? rows);
      toast.success(t("تم الحفظ", "Saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر الحفظ", "Could not save"));
    }
  }

  async function verify() {
    try {
      setIntegrity(await apiFetch("/audit-logs/verify"));
      setRetention(await apiFetch("/audit-logs/retention"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر الفحص", "Check failed"));
    }
  }

  const shiftRequired = settings?.find((r) => r.key === "shiftReportRequired")?.value === true;
  return <>
    {canManage && <SettingsSection title={t("التقارير والسجلات", "Reports & records")} description={t("خيارات تخص كل موظفي المركز.", "Options that apply to every employee.")}>
      <PreferenceSwitch title={t("إلزام تقرير الدوام", "Require shift report")}
        description={t("لا يستطيع الموظف الذي عمل اليوم تسجيل الخروج قبل تقديم تقرير دوامه (يستثنى مدير النظام).", "Employees who worked today cannot sign out before submitting a shift report (super admin is exempt).")}
        selected={shiftRequired} onChange={(value) => save("shiftReportRequired", value)} />
      <div className="preference-row"><div><label htmlFor="retention-years" className="preference-label">{t("مدة الاحتفاظ بسجل التدقيق (سنوات)", "Audit retention (years)")}</label>
        <p className="preference-description">{t("لا يُحذف السجل أبداً؛ يُؤرشف بالتصدير بعد هذه المدة.", "The trail is never deleted; it is archived by export after this period.")}</p></div>
        <span className="flex items-center gap-2"><input id="retention-years" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} className="w-20 rounded-md border border-border px-2 py-1 text-sm" />
          <button type="button" className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground" onClick={() => save("auditRetentionYears", Number(years))}>{t("حفظ", "Save")}</button></span></div>
    </SettingsSection>}
    {canAudit && <SettingsSection title={t("سلامة سجل التدقيق", "Audit trail integrity")} description={t("يعيد فحص سلسلة التجزئة لكشف أي تعديل على السجلات خارج النظام.", "Re-checks the hash chain to reveal any edit made to the records outside the system.")}>
      <div className="preference-row"><button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={verify}>{t("فحص السلسلة الآن", "Verify chain now")}</button>
        {integrity && <span role="status" className={integrity.ok ? "text-success" : "text-danger"}>{integrity.ok ? t(`سليمة — فُحص ${formatNumber(integrity.checked)} سجلاً`, `Intact — ${formatNumber(integrity.checked)} records checked`) : t(`مكسورة عند التسلسل ${integrity.brokenAtSeq}: ${integrity.reason}`, `Broken at #${integrity.brokenAtSeq}: ${integrity.reason}`)}</span>}</div>
      {retention && <div className="preference-row"><span className="preference-label">{t("سجلات أقدم من مدة الاحتفاظ", "Records older than retention")}</span><span className="preference-value">{formatNumber(retention.olderThanCutoff)} / {formatNumber(retention.total)}{retention.oldestAt ? ` · ${formatDate(retention.oldestAt, { year: "numeric", month: "short" })}` : ""}</span></div>}
    </SettingsSection>}
  </>;
}

export default function SettingsPage() {
  const user = useCurrentUser();
  const { t, theme, setTheme, compact, setCompact, reducedMotion, setReducedMotion } = useI18n();
  if (!user) return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;

  return <AdminShell user={user}>
    <Tabs defaultSelectedKey={user.mustChangePassword ? "account" : "appearance"} className="settings-tabs">
      <div className="settings-tabbar"><Tabs.ListContainer><Tabs.List aria-label={t("أقسام الإعدادات", "Settings sections")}>
        <Tabs.Tab id="account">{t("إعدادات الحساب", "Account settings")}<Tabs.Indicator /></Tabs.Tab>
        <Tabs.Tab id="appearance">{t("المظهر", "Appearance")}<Tabs.Indicator /></Tabs.Tab>
        {(user.permissions.includes("settings.manage") || user.permissions.includes("audit.view")) && <Tabs.Tab id="system">{t("النظام", "System")}<Tabs.Indicator /></Tabs.Tab>}
        <Tabs.Tab id="language">{t("اللغة والمنطقة", "Language & region")}<Tabs.Indicator /></Tabs.Tab>
      </Tabs.List></Tabs.ListContainer><span className="autosave-note"><span />{t("يُحفظ تلقائياً", "Saved automatically")}</span></div>
      <Tabs.Panel id="appearance" className="settings-panel">
        <SettingsSection title={t("تفضيلات العرض", "Display preferences")} description={t("خصص مساحة العمل بما يناسب يومك في المركز.", "Make your workspace comfortable for your day at the center.")}>
          <PreferenceSwitch title={t("المظهر الداكن", "Dark appearance")} description={t("استخدم ألواناً داكنة للعمل في الإضاءة المنخفضة.", "Use a darker palette in low-light environments.")} selected={theme === "dark"} onChange={(selected) => setTheme(selected ? "dark" : "light")} />
          <PreferenceSwitch title={t("العرض المضغوط", "Compact layout")} description={t("قلل المسافات لعرض صفوف أكثر في الجداول.", "Reduce spacing to see more rows in your tables.")} selected={compact} onChange={setCompact} />
          <PreferenceSwitch title={t("تقليل الحركة", "Reduce motion")} description={t("قلل تأثيرات الانتقال والحركة في الواجهة.", "Minimize animations and transitions throughout the interface.")} selected={reducedMotion} onChange={setReducedMotion} />
        </SettingsSection>
        <LanguageSettings />
      </Tabs.Panel>
      <Tabs.Panel id="system" className="settings-panel"><SystemSettings canManage={user.permissions.includes("settings.manage")} canAudit={user.permissions.includes("audit.view")} /></Tabs.Panel>
      <Tabs.Panel id="language" className="settings-panel"><LanguageSettings /></Tabs.Panel>
      <Tabs.Panel id="account" className="settings-panel">
        <SettingsSection title={t("الحساب الشخصي", "Personal account")} description={t("معلومات حسابك المسجل في المركز.", "Your registered account information at the center.")}>
          <div className="preference-row"><span className="preference-label">{t("الاسم الكامل", "Full name")}</span><bdi className="preference-value">{user.fullName}</bdi></div>
          <div className="preference-row"><span className="preference-label">{t("اسم المستخدم", "Username")}</span><bdi className="preference-value">{user.username}</bdi></div>
        </SettingsSection>
        <ChangePassword />
        <SettingsSection title={t("صلاحيات الوصول", "Workspace access")} description={t("يتولى مسؤول النظام إدارة الأدوار والصلاحيات.", "Your administrator manages account roles and permissions.")}>
          <p className="account-access-note">{t("تظهر أقسام النظام والإجراءات المتاحة حسب الصلاحيات المسندة إلى حسابك.", "Available sections and actions follow the permissions assigned to your account.")}</p>
        </SettingsSection>
      </Tabs.Panel>
    </Tabs>
    <p className="settings-footnote">{t("تُحفظ تفضيلات اللغة والمظهر في هذا المتصفح.", "Language and appearance preferences are saved in this browser.")}</p>
  </AdminShell>;
}
