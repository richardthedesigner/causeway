"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { watchForUpdate } from "@/lib/sw-update";

/**
 * "A new version is ready" with Reload and Later (DEP-04, D-045). Waits
 * while navigating: a reload mid-journey would drop the route. Rendered on
 * the body, outside <main>, which the bottom sheet hides from screen readers.
 */
export function UpdatePrompt({ navigating }: { navigating: boolean }) {
  const [ready, setReady] = useState(false);
  const [later, setLater] = useState(false);
  useEffect(() => watchForUpdate(() => setReady(true)), []);
  if (!ready || later || navigating) return null;
  return createPortal(
    <div
      role="status"
      aria-label="Update"
      className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-50 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-ink shadow-[0_8px_30px_rgb(0_0_0/0.25)] md:right-4 md:left-auto md:w-96"
    >
      <RefreshCw aria-hidden className="size-5 shrink-0 text-accent" />
      <p className="m-0 min-w-0 flex-1 basis-40">A new version of Causewayside is ready.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => location.reload()}>
          Reload
        </Button>
        <Button variant="ghost" onClick={() => setLater(true)}>
          Later
        </Button>
      </div>
    </div>,
    document.body,
  );
}
