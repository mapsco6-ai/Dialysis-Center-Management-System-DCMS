"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { API_URL, getToken } from "@/lib/api";

export type LiveUpdateEntity = "session" | "schedule" | "machine";

// The REST API and the Socket.IO gateway are the same NestJS process
// (docs/PROJECT-PHASES-PLAN.md Phase 13) - derive the WS origin from
// API_URL by stripping the "/api/v1" prefix rather than hardcoding a
// second env var for the same server.
function wsOrigin(): string {
  return API_URL.replace(/\/api\/v1\/?$/, "");
}

// Subscribes to the dashboard's live-update broadcast and calls onUpdate
// whenever something relevant changes, so the caller re-fetches its own
// already-permission-gated REST snapshot - the socket itself never carries
// any clinical/operational data, just a category tag (docs/MODULES-SPEC.md
// Phase 13: "دون تخزين مكرر للبيانات"). A caller should still keep a slow
// polling interval as a safety net; this is a push-based acceleration, not
// the only path to freshness if the socket never connects.
export function useLiveUpdates(onUpdate: (entity: LiveUpdateEntity) => void) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket: Socket = io(wsOrigin(), { auth: { token }, transports: ["websocket"] });
    socket.on("live:update", (payload: { entity: LiveUpdateEntity }) => {
      callbackRef.current(payload.entity);
    });

    return () => {
      socket.disconnect();
    };
  }, []);
}
