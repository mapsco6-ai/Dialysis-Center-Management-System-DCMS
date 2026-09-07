import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DCMS - Dialysis Center Management System",
  description: "نظام إدارة مركز الديلزة المتكامل",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
