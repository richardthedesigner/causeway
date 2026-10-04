"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Full-height sheet for focused tasks (changing how you get around). Modal, focus-trapped, Escape closes. */
export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
      <Dialog.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[94dvh] max-w-[560px] flex-col rounded-t-[var(--radius)] bg-surface text-ink shadow-2xl outline-none",
          "md:inset-y-4 md:right-4 md:left-auto md:max-h-none md:w-[460px] md:rounded-[var(--radius)]",
          className,
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <Dialog.Title className="m-0 text-xl font-bold">{title}</Dialog.Title>
            {description ? <Dialog.Description className="mt-1 text-muted">{description}</Dialog.Description> : null}
          </div>
          <Dialog.Close className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2" aria-label="Close">
            <X aria-hidden className="size-6" />
          </Dialog.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
