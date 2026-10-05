"use client";
import * as React from "react";
import { Drawer as Vaul } from "vaul";
import { cn } from "@/lib/utils";

/**
 * Apple Maps style bottom sheet on vaul. Non-modal, so the map stays usable
 * behind it, with snap points so primary controls sit in the bottom third.
 * Tab leaves the sheet for the map controls: vaul needs a patch to pass
 * `modal` on to Radix (patches/vaul@1.1.2.patch), and Radix loops Tab inside
 * even a non-modal dialog, so the wrapper below stops Tab reaching its loop.
 */
export const Drawer = Vaul.Root;
export const DrawerTitle = Vaul.Title;
export const DrawerDescription = Vaul.Description;

export const DrawerContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof Vaul.Content>>(
  ({ className, children, ...props }, ref) => (
    <Vaul.Portal>
      <Vaul.Content
        ref={ref}
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 mx-auto flex h-[96dvh] max-w-[520px] flex-col rounded-t-[var(--radius)] border border-line bg-surface text-ink shadow-[0_-8px_40px_rgb(0_0_0/0.18)] outline-none focus-visible:outline-none",
          "md:inset-x-auto md:left-4 md:bottom-4 md:h-[calc(100dvh-2rem)] md:w-[420px] md:rounded-[var(--radius)]",
          className,
        )}
        {...props}
      >
        <div aria-hidden className="mx-auto mt-2.5 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-line" />
        <div className="contents" onKeyDown={(e) => e.key === "Tab" && e.stopPropagation()}>
          {children}
        </div>
      </Vaul.Content>
    </Vaul.Portal>
  ),
);
DrawerContent.displayName = "DrawerContent";
