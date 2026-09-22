import type { SVGProps } from "react";

export type IconName = "dashboard" | "patients" | "calendar" | "reception" | "nursing" | "doctor" | "lab" | "pharmacy" | "inventory" | "machines" | "maintenance" | "reports" | "quality" | "settings" | "search" | "sun" | "moon" | "language" | "logout" | "menu" | "close" | "chevron" | "eye" | "eyeOff" | "shield";

const paths: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  patients: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2" /></>,
  reception: <><path d="M3 21V4h12v17M2 21h20M7 8h4m-4 4h4m6 9v-7h4v7" /><circle cx="10" cy="17" r=".6" /></>,
  nursing: <><path d="M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z" /><path d="M8 12h8m-4-4v8" /></>,
  doctor: <><path d="M5 3v6a5 5 0 0 0 10 0V3M3 3h4m6 0h4m-7 11v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="11" r="2" /></>,
  lab: <><path d="M9 3h6m-5 0v7L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10" /></>,
  pharmacy: <><path d="m9 4-5 5a6 6 0 0 0 8 8l5-5a6 6 0 0 0-8-8Zm-3 3 8 8" /></>,
  inventory: <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5ZM3 8l9 5 9-5m-9 5v9M7 5.5l10 5.5" /></>,
  machines: <><rect x="4" y="3" width="16" height="15" rx="2" /><path d="M8 22v-4m8 4v-4M7 8h3l2 4 2-6 2 4h2M8 15h1m3 0h4" /></>,
  maintenance: <><path d="M14 6a5 5 0 0 0-6 6l-5 5a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-4 3-3-3 3-4Z" /></>,
  reports: <><path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 17v-3m4 3v-6m4 6v-4" /></>,
  quality: <><path d="m12 3 9 4v5c0 5-9 10-9 10S3 17 3 12V7l9-4Z" /><path d="m8 12 3 3 5-6" /></>,
  settings: <><path d="m9 3-.6 3-2 .9-2.8-.9L2 9l2 2v2l-2 2 1.6 3 2.8-.9 2 .9.6 3h6l.6-3 2-.9 2.8.9 1.6-3-2-2v-2l2-2-1.6-3-2.8.9-2-.9L15 3H9Z" /><circle cx="12" cy="12" r="3" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
  moon: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z" />,
  language: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  logout: <><path d="M9 3H4v18h5m6-14 5 5-5 5M8 12h12" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.4 17.4 0 0 1-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8M9.5 9.5a3 3 0 0 0 4.2 4.2" /></>,
  shield: <><path d="m12 3 8 3.5v5c0 5-3.6 8-8 9.5-4.4-1.5-8-4.5-8-9.5v-5L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
};

export function WorkspaceIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export function CenterMark() {
  return <span className="center-mark" aria-hidden="true"><svg width="27" height="27" viewBox="0 0 32 32" fill="none"><path d="M13 3h6v10h10v6H19v10h-6V19H3v-6h10V3Z" fill="currentColor" /><path d="m3 17 7 1 3-5 4 9 3-6h9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
}
