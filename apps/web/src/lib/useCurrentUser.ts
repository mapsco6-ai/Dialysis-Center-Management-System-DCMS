"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { AuthenticatedUser } from "@/lib/types";

export function useCurrentUser() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch("/auth/me")
      .then(setUser)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (error) router.push("/login");
  }, [error, router]);

  return user;
}
