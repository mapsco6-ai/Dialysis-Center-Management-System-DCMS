"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";

// V1.1 (docs/COMPREHENSIVE-DEVELOPMENT-PLAN-V1.md §2.2): one shared fetching
// layer instead of every page re-inventing loading/error handling. Requests
// are numbered and only the newest one may apply its result, so racing
// navigations (fast page switching, filter spam) can never paint stale data -
// the DCMS-011 pattern, now everywhere by default instead of hand-rolled in
// one page.
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback((targetPath: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    apiFetch(targetPath)
      .then((result) => {
        if (requestId === requestIdRef.current) setData(result);
      })
      .catch((err) => {
        if (requestId === requestIdRef.current) setError(err instanceof Error ? err.message : "Request failed");
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      setError(null);
      return;
    }
    load(path);
  }, [path, load]);

  const refresh = useCallback(() => {
    if (path) load(path);
  }, [path, load]);

  return { data, loading, error, refresh };
}