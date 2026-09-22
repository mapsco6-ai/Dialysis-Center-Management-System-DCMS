"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { API_URL } from "./api";

// V1.1 (§2.2): one shared socket for the whole app. Connects lazily with the
// login JWT the gateway already validates, then re-broadcasts the data-free
// category tags ("a patient changed") to page subscribers - every page reacts
// by re-fetching its own permission-gated REST data, never from the socket
// payload (same contract as DashboardGateway on the API side).
export type LiveEvent = { entity: string };

type Listener = (event: LiveEvent) => void;

let socket: Socket | null = null;
const listeners = new Set<Listener>();
const notificationListeners = new Set<() => void>();

function ensureSocket(): Socket | null {
  if (typeof window === "undefined") return socket;
  if (socket) return socket;
  // The gateway hangs off the API's HTTP server root, not the /api/v2 prefix.
  const origin = API_URL.replace(/\/api\/v[12]\/?$/, "");
  // The HttpOnly session cookie rides along with the handshake.
  socket = io(origin, { withCredentials: true });
  socket.on("live:update", (payload: LiveEvent) => {
    listeners.forEach((listener) => listener(payload));
  });
  // A pushed notification is only a nudge: the bell re-fetches its own list.
  socket.on("notification", () => notificationListeners.forEach((listener) => listener()));
  socket.on("disconnect", () => {
    // socket.io reconnects automatically; pages keep working over REST in
    // the meantime (V1.1 keeps the 15s queue polling as the fallback).
  });
  return socket;
}

// Stable subscription: the latest handler is kept in a ref, so pages can pass
// an inline closure without resubscribing on every render.
export function useLiveEvents(handler: (event: LiveEvent) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const client = ensureSocket();
    if (!client) return;
    const listener: Listener = (event) => handlerRef.current(event);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
export function useNotificationEvents(handler: () => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ensureSocket()) return;
    const listener = () => handlerRef.current();
    notificationListeners.add(listener);
    return () => {
      notificationListeners.delete(listener);
    };
  }, []);
}
