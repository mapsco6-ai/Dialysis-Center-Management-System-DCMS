"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { AuthenticatedUser } from "@/lib/types";

export function useCurrentUser() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  // Only "not authenticated" should bounce to /login - a network hiccup or a
  // 500 shouldn't silently look like a session problem (docs review DCMS-021).
  const [unauthenticated, setUnauthenticated] = useState(false);

  useEffect(() => {
    apiFetch("/auth/me")
      .then(setUser)
      .catch((err) => {
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
