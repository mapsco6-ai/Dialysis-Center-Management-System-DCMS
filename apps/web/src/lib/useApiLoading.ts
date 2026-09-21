"use client";

import { useSyncExternalStore } from "react";
import { getPendingRequestCount, subscribePendingRequests } from "./api";

export function useApiLoading() {
  return useSyncExternalStore(
    subscribePendingRequests,
    () => getPendingRequestCount() > 0,
    () => false,
  );
}
