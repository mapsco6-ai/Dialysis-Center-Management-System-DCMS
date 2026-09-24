"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { API_URL } from "./api";

// One shared socket. Live tags ("a patient changed") stay data-free and pages
// re-fetch REST. A "notification" event carries the row for that user only;
// the bell inserts it without another list request.
export type LiveEvent = { entity: string };

type Listener = (event: LiveEvent) => void;

export type SocketNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

let socket: Socket | null = null;
const listeners = new Set<Listener>();
const notificationListeners = new Set<(notification: SocketNotification) => void>();

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
  // Full row, private room. Bell inserts it. socket.io reconnects on its own.
  socket.on("notification", (payload: SocketNotification) => {
    if (!payload?.id) return;
    notificationListeners.forEach((listener) => listener(payload));
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
export function useNotificationEvents(handler: (notification: SocketNotification) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ensureSocket()) return;
    const listener = (notification: SocketNotification) => handlerRef.current(notification);
    notificationListeners.add(listener);
    return () => {
      notificationListeners.delete(listener);
    };
  }, []);
}
