// Shared by every page with a PDF/Excel export button (Phase 14 Reports,
// Phase 15 Quality & Safety) - triggers a browser download from a Blob
// already fetched via apiFetchBlob (the API's own auth header, not a plain
// <a href> the browser could hit unauthenticated).
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
