import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import { I18nProvider, Locale, Theme } from "@/lib/i18n";
import { GlobalLoader } from "@/components/GlobalLoader";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

// The design system names these two faces: Inter for Latin, IBM Plex Sans
// Arabic for Arabic. next/font self-hosts both, so there's no runtime request.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-latin", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-arabic", display: "swap" });

export const metadata: Metadata = {
  title: "DCMS - Dialysis Center Management System",
  description: "نظام إدارة مركز الديلزة المتكامل",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale: Locale = cookieStore.get("dcms_locale")?.value === "en" ? "en" : "ar";
  const theme: Theme = cookieStore.get("dcms_theme")?.value === "dark" ? "dark" : "light";
  const compact = cookieStore.get("dcms_compact")?.value === "true";
  const reducedMotion = cookieStore.get("dcms_reducedMotion")?.value === "true";
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={`${inter.variable} ${plexArabic.variable} ${theme === "dark" ? "dark" : ""}`.trim()}
      data-theme={theme} data-density={compact ? "compact" : "comfortable"} data-reduced-motion={String(reducedMotion)}>
      <body><I18nProvider initialPreferences={{ locale, theme, compact, reducedMotion }}>{children}<GlobalLoader /><Toaster /></I18nProvider></body>
    </html>
  );
}
