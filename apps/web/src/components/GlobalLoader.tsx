"use client";

import { useEffect, useState } from "react";
import { useApiLoading } from "@/lib/useApiLoading";

// Only shows the overlay once a request has been pending for a bit, so a
// fast API call doesn't flash a spinner on screen for a single frame.
const SHOW_DELAY_MS = 150;

export function GlobalLoader() {
  const isLoading = useApiLoading();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div className="global-loader" role="status" aria-live="polite">
      <span className="global-loader-spinner" />
    </div>
  );
}
