"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { I18nProvider as AriaI18nProvider } from "@heroui/react";

export type Locale = "ar" | "en";
export type Theme = "light" | "dark";
export type Translate = (arabic: string, english: string) => string;

type Preferences = {
  locale: Locale;
  theme: Theme;
  compact: boolean;
  reducedMotion: boolean;
};

type I18nContextValue = Preferences & {
  direction: "rtl" | "ltr";
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  setCompact: (compact: boolean) => void;
  setReducedMotion: (reducedMotion: boolean) => void;
  t: Translate;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

// Cookies let the server render the selected language and appearance on the
// first paint, including after refresh. No patient data is stored here.
function persistPreference(name: string, value: string) {
  document.cookie = `dcms_${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function I18nProvider({ children, initialPreferences }: {
  children: React.ReactNode;
  initialPreferences: Preferences;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const { locale, theme, compact, reducedMotion } = preferences;
  const direction = locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = direction;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
    root.dataset.density = compact ? "compact" : "comfortable";
    root.dataset.reducedMotion = String(reducedMotion);
  }, [locale, direction, theme, compact, reducedMotion]);

  const updatePreference = useCallback(<K extends keyof Preferences>(name: K, value: Preferences[K]) => {
    persistPreference(name, String(value));
    setPreferences((current) => ({ ...current, [name]: value }));
  }, []);

  const t = useCallback<Translate>((arabic, english) => locale === "ar" ? arabic : english, [locale]);
  const formatDate = useCallback((value: string | Date, options?: Intl.DateTimeFormatOptions) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ" : "en-GB", options).format(date);
  }, [locale]);
  const formatNumber = useCallback((value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-GB", options).format(value), [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    ...preferences, direction, t, formatDate, formatNumber,
    setLocale: (next) => updatePreference("locale", next),
    setTheme: (next) => updatePreference("theme", next),
    setCompact: (next) => updatePreference("compact", next),
    setReducedMotion: (next) => updatePreference("reducedMotion", next),
  }), [preferences, direction, t, formatDate, formatNumber, updatePreference]);

  return (
    <I18nContext.Provider value={value}>
      <AriaI18nProvider locale={locale === "ar" ? "ar-IQ" : "en-GB"}>{children}</AriaI18nProvider>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
