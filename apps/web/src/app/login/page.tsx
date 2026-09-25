"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { CenterMark, WorkspaceIcon } from "@/components/WorkspaceIcon";

export default function LoginPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleResetRequest(event: FormEvent) {
    event.preventDefault();
    setResetState("sending");
    try {
      await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ username: resetUsername }) });
      setResetState("sent");
    } catch {
      setResetState("error");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setHasError(false);
    setLoading(true);
    try {
      // "remember" is UI-only for now - every session lasts the same fixed
      // duration (JWT_EXPIRES_IN) regardless, so it isn't sent to the API.
      const data = await apiFetch("/auth/sessions", { method: "POST", body: JSON.stringify({ username, password }) });
      // The API sets the HttpOnly session cookie itself.
      router.push(data.user?.landingPath ?? "/admin");
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-visual" aria-hidden="true">
          <div className="login-visual-tag">
            <span className="login-visual-dot" />
            {t("رعاية أفضل، كل يوم", "Better care, every day")}
          </div>
          <div className="login-visual-copy">
            <h2>{t("مركز رعاية الكلى", "Kidney care center")}</h2>
            <p>{t("جدولة الجلسات، متابعة الأجهزة والمرضى، وكل فريقك في مكان واحد.", "Session scheduling, machine and patient tracking — your whole team, one workspace.")}</p>
          </div>
          <svg className="login-visual-wave" viewBox="0 0 400 80" preserveAspectRatio="none" role="presentation">
            <path d="M0 40 L60 40 L80 12 L110 68 L140 40 L400 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="login-visual-footer">
            <div className="login-visual-dots"><span /><span /><span /></div>
            <span>DCMS</span>
          </div>
        </section>

        <section className="login-panel">
          <div className="login-panel-top">
            <div className="login-brand"><CenterMark /><span>DCMS</span></div>
            <Button variant="outline" size="sm" onPress={() => setLocale(locale === "ar" ? "en" : "ar")} aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}>
              <WorkspaceIcon name="language" width={16} height={16} />{locale === "ar" ? "English" : "العربية"}
            </Button>
          </div>

          <div className="login-intro">
            <h1>{t("أهلاً بعودتك", "Welcome back!")}</h1>
            <p>{t("سجّل دخولك إلى نظام إدارة مركز الديلزة.", "Sign in now to access your dialysis center workspace.")}</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label className="login-field">
              <span>{t("اسم المستخدم", "Username")}</span>
              <input name="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" autoFocus dir="auto" placeholder={t("أدخل اسم المستخدم", "Enter your username")} />
            </label>

            <label className="login-field">
              <span>{t("كلمة المرور", "Password")}</span>
              <div className="login-password-wrap">
                <input name="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder={t("أدخل كلمة المرور", "Enter your password")} />
                <button type="button" className="login-password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? t("إخفاء كلمة المرور", "Hide password") : t("إظهار كلمة المرور", "Show password")}>
                  <WorkspaceIcon name={showPassword ? "eyeOff" : "eye"} width={17} height={17} />
                </button>
              </div>
            </label>

            <div className="login-row">
              <label className="login-remember">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                {t("تذكّر حسابي", "Remember my account")}
              </label>
              <button type="button" className="login-forgot" aria-expanded={forgotOpen} onClick={() => { setForgotOpen((v) => !v); setResetUsername(username); setResetState("idle"); }}>
                {t("نسيت كلمة المرور؟", "Forgot password?")}
              </button>
            </div>

            {hasError && <p role="alert" className="login-error">{t("تعذر تسجيل الدخول. تحقق من بياناتك واتصالك ثم حاول مجدداً.", "Unable to sign in. Check your credentials and connection, then try again.")}</p>}

            {/* A plain native button, not HeroUI's <Button> - that component
                doesn't reliably trigger the form's native submit here (every
                other real form-submit button in this app is plain HTML for
                the same reason; HeroUI's Button is reserved for onPress
                actions like the language toggle above). */}
            <button type="submit" disabled={loading} className="login-submit-btn w-full">
              {loading ? t("جاري الدخول...", "Signing in...") : t("تسجيل الدخول", "Login")}
            </button>
          </form>

          {forgotOpen && (
            <form onSubmit={handleResetRequest} className="login-form mt-4 rounded-lg border border-border p-4">
              {resetState === "sent" ? (
                <p role="status" className="text-sm">
                  {t("تم إرسال طلبك إلى مسؤول النظام. سيزوّدك بكلمة مرور مؤقتة بعد الموافقة.", "Your request was sent to the system administrator. They will give you a temporary password once approved.")}
                </p>
              ) : (
                <>
                  <label className="login-field">
                    <span>{t("اسم المستخدم لإعادة تعيين كلمة المرور", "Username to reset")}</span>
                    <input value={resetUsername} onChange={(e) => setResetUsername(e.target.value)} required autoComplete="username" dir="auto" placeholder={t("أدخل اسم المستخدم", "Enter your username")} />
                  </label>
                  {resetState === "error" && <p role="alert" className="login-error">{t("تعذر إرسال الطلب. حاول مجدداً.", "Could not send the request. Try again.")}</p>}
                  <button type="submit" disabled={resetState === "sending"} className="login-submit-btn w-full">
                    {resetState === "sending" ? t("جاري الإرسال...", "Sending...") : t("إرسال الطلب", "Send request")}
                  </button>
                </>
              )}
            </form>
          )}

          <p className="login-help"><WorkspaceIcon name="shield" width={14} height={14} />{t("ليس لديك حساب؟ تواصل مع مسؤول النظام في مركزك لإنشائه.", "Don't have an account? Contact your center's system administrator.")}</p>
        </section>
      </div>
      <footer className="login-footer">{t("نظام إدارة مركز الديلزة", "Dialysis Center Management System")}</footer>
    </main>
  );
}
