/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Socket.IO polls `/socket.io/`. Next's trailing-slash redirect turns that
  // into `/socket.io` before the rewrite, and the API never sees the handshake.
  skipTrailingSlashRedirect: true,
  // Reaching the API on a different host than the page makes the SameSite=Lax
  // session cookie cross-site, so the browser drops it: login returns 200 and
  // the app still acts signed out. That bites both hosted deployments (web and
  // API on separate domains) and local use (page on 127.0.0.1, API on
  // localhost - different sites to a browser, despite the same machine).
  // API_PROXY_TARGET serves the API under whatever origin the page was opened
  // on, so the cookie is always first-party. Unset, this adds nothing.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET?.replace(/\/$/, "");
    if (!target) return [];
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      // Exact path. `:path*` compiles to a slash that disappears when the
      // segment is empty, so the API receives `/socket.io` and ignores it.
      { source: "/socket.io", destination: `${target}/socket.io/` },
    ];
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
