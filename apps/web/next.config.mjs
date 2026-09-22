/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hosted deployments put the web app and the API on separate domains, which
  // makes the SameSite=Lax session cookie cross-site - the browser would drop
  // it and every request after login would be anonymous. Setting
  // API_PROXY_TARGET (e.g. the API's private hostname) serves the API under
  // the web app's own origin instead, so the cookie stays first-party.
  // Unset - as in local docker compose, where NEXT_PUBLIC_API_URL is absolute -
  // this adds nothing and the direct cross-origin calls are unchanged.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET?.replace(/\/$/, "");
    return target ? [{ source: "/api/:path*", destination: `${target}/api/:path*` }] : [];
  },
  // The admin URLs were regrouped by domain (care / facility / governance /
  // people). Every old bookmark, notification link and printed QR keeps working.
  async redirects() {
    return [
      { source: "/admin/schedule", destination: "/admin/care/appointments", permanent: true },
      { source: "/admin/schedule/:path*", destination: "/admin/care/appointments/:path*", permanent: true },
      { source: "/admin/patients", destination: "/admin/care/patients", permanent: true },
      { source: "/admin/patients/:path*", destination: "/admin/care/patients/:path*", permanent: true },
      { source: "/admin/reception", destination: "/admin/care/reception", permanent: true },
      { source: "/admin/reception/:path*", destination: "/admin/care/reception/:path*", permanent: true },
      { source: "/admin/nursing", destination: "/admin/care/nursing", permanent: true },
      { source: "/admin/nursing/:path*", destination: "/admin/care/nursing/:path*", permanent: true },
      { source: "/admin/doctor", destination: "/admin/care/doctor", permanent: true },
      { source: "/admin/doctor/:path*", destination: "/admin/care/doctor/:path*", permanent: true },
      { source: "/admin/lab", destination: "/admin/care/lab", permanent: true },
      { source: "/admin/lab/:path*", destination: "/admin/care/lab/:path*", permanent: true },
      { source: "/admin/pharmacy", destination: "/admin/care/pharmacy", permanent: true },
      { source: "/admin/pharmacy/:path*", destination: "/admin/care/pharmacy/:path*", permanent: true },
      { source: "/admin/sessions", destination: "/admin/care/sessions", permanent: true },
      { source: "/admin/sessions/:path*", destination: "/admin/care/sessions/:path*", permanent: true },
      { source: "/admin/machines", destination: "/admin/facility/machines", permanent: true },
      { source: "/admin/machines/:path*", destination: "/admin/facility/machines/:path*", permanent: true },
      { source: "/admin/maintenance", destination: "/admin/facility/maintenance", permanent: true },
      { source: "/admin/maintenance/:path*", destination: "/admin/facility/maintenance/:path*", permanent: true },
      { source: "/admin/inventory", destination: "/admin/facility/inventory", permanent: true },
      { source: "/admin/inventory/:path*", destination: "/admin/facility/inventory/:path*", permanent: true },
      { source: "/admin/quality", destination: "/admin/governance/quality", permanent: true },
      { source: "/admin/quality/:path*", destination: "/admin/governance/quality/:path*", permanent: true },
      { source: "/admin/reports", destination: "/admin/governance/reports", permanent: true },
      { source: "/admin/reports/:path*", destination: "/admin/governance/reports/:path*", permanent: true },
      { source: "/admin/oversight", destination: "/admin/governance/oversight", permanent: true },
      { source: "/admin/oversight/:path*", destination: "/admin/governance/oversight/:path*", permanent: true },
      { source: "/admin/audit", destination: "/admin/governance/audit", permanent: true },
      { source: "/admin/audit/:path*", destination: "/admin/governance/audit/:path*", permanent: true },
      { source: "/admin/staff", destination: "/admin/people/staff", permanent: true },
      { source: "/admin/staff/:path*", destination: "/admin/people/staff/:path*", permanent: true },
      { source: "/admin/entries", destination: "/admin/people/entries", permanent: true },
      { source: "/admin/entries/:path*", destination: "/admin/people/entries/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
