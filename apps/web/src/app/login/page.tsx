"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, TextField } from "@heroui/react";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { CenterMark, WorkspaceIcon } from "@/components/WorkspaceIcon";

export default function LoginPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setHasError(false);
    setLoading(true);
    try {
      const data = await apiFetch("/auth/sessions", { method: "POST", body: JSON.stringify({ username, password }) });
      // The API sets the HttpOnly session cookie itself.
      router.push(data.user?.landingPath ?? "/admin");
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-page">
    <header className="login-header"><div className="login-brand"><CenterMark /><span>DCMS</span></div>
      <Button variant="outline" size="sm" onPress={() => setLocale(locale === "ar" ? "en" : "ar")} aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}><WorkspaceIcon name="language" width={16} height={16} />{locale === "ar" ? "English" : "العربية"}</Button>
    </header>
    <div className="login-body"><div className="login-intro"><span className="login-eyebrow">{t("رعاية أفضل، كل يوم", "Better care, every day")}</span><h1>{t("أهلاً بعودتك", "Welcome back")}</h1><p>{t("سجّل دخولك إلى نظام إدارة مركز الديلزة.", "Sign in to your dialysis center workspace.")}</p></div>
      <form onSubmit={handleSubmit} className="login-form">
        <TextField name="username" value={username} onChange={setUsername} isRequired className="w-full"><Label>{t("اسم المستخدم", "Username")}</Label><Input autoComplete="username" autoFocus dir="auto" placeholder={t("أدخل اسم المستخدم", "Enter your username")} /></TextField>
        <TextField name="password" type="password" value={password} onChange={setPassword} isRequired className="w-full"><Label>{t("كلمة المرور", "Password")}</Label><Input autoComplete="current-password" placeholder={t("أدخل كلمة المرور", "Enter your password")} /></TextField>
        {hasError && <p role="alert" className="login-error">{t("تعذر تسجيل الدخول. تحقق من بياناتك واتصالك ثم حاول مجدداً.", "Unable to sign in. Check your credentials and connection, then try again.")}</p>}
        <Button type="submit" variant="primary" isDisabled={loading} className="w-full">{loading ? t("جاري الدخول...", "Signing in...") : t("تسجيل الدخول", "Sign in")}</Button>
      </form>
      <p className="login-help">{t("تحتاج مساعدة بالدخول؟ تواصل مع مسؤول النظام في المركز.", "Need access? Contact your center’s system administrator.")}</p>
    </div>
    <footer className="login-footer">{t("نظام إدارة مركز الديلزة", "Dialysis Center Management System")}<span>DCMS</span></footer>
  </main>;
}
