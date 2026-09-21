"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { AuthenticatedUser } from "@/lib/types";

// One /auth/me request per page load, shared by every component that asks
// (the shell, the page, the bell...) instead of one request each. Cleared on
// sign-out and on a 401 so a different user never sees a stale identity.
let cached: AuthenticatedUser | null = null;
let pending: Promise<AuthenticatedUser> | null = null;

export function clearCurrentUser() {
  cached = null;
  pending = null;
}

export function useCurrentUser() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(cached);
  // Only "not authenticated" should bounce to /login - a network hiccup or a
  // 500 shouldn't silently look like a session problem (docs review DCMS-021).
  const [unauthenticated, setUnauthenticated] = useState(false);

  useEffect(() => {
    if (cached) {
      setUser(cached);
      return;
    }
    pending ??= apiFetch("/auth/me").then((me) => (cached = me));
    pending
      .then(setUser)
      .catch((err) => {
        pending = null;
        if (err instanceof ApiError && err.status === 401) {
          setUnauthenticated(true);
        }
      });
  }, []);

  useEffect(() => {
    if (unauthenticated) router.push("/login");
  }, [unauthenticated, router]);

  return user;
}

export const hasPermission = (user: AuthenticatedUser | null, permission: string) =>
  Boolean(user?.permissions.includes(permission));

// Renders children only when the user holds the permission (any of them, when
// an array is given) - the one place UI gating is expressed.
export function Can({ permission, children, fallback = null }: { permission: string | string[]; children: React.ReactNode; fallback?: React.ReactNode }) {
  const user = useCurrentUser();
  const needed = Array.isArray(permission) ? permission : [permission];
  return <>{needed.some((p) => hasPermission(user, p)) ? children : fallback}</>;
}
