"use client";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Move to a section of the route and open it if it's folded (FEAT-23). Focus
 * goes to its heading or summary, so keyboard and screen reader users land
 * where the tile said.
 */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  el.querySelector<HTMLElement>(el instanceof HTMLDetailsElement ? "summary" : "h3")?.focus({ preventScroll: true });
}

export interface Fact {
  /** The section it jumps to. */
  target: string;
  label: string;
  value: string;
  icon: React.ReactNode;
}

/**
 * The route's key facts at a glance: a tile each, with an icon, a word and a
 * number, never colour alone. Each one opens its section.
 */
export function AtAGlance({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null;
  return (
    <section aria-labelledby="glance-h" className="grid gap-2">
      <h3 id="glance-h" className="m-0 font-mono text-xs tracking-[0.08em] text-muted uppercase">
        At a glance
      </h3>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(9.5rem,100%),1fr))] gap-2 p-0">
        {facts.map((f) => (
          <li key={f.target} className="min-w-0">
            <button
              type="button"
              onClick={() => jumpTo(f.target)}
              className="flex h-full min-h-14 w-full min-w-0 items-start gap-2 rounded-2xl border border-line bg-surface-2 p-3 text-left hover:border-ink"
            >
              <span className="mt-0.5 shrink-0">{f.icon}</span>
              <span className="grid min-w-0 leading-snug [overflow-wrap:anywhere]">
                <span className="text-sm text-muted">{f.label}</span>
                <span className="font-bold">{f.value}</span>
                <span className="sr-only">. Show details</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A section shown open: a real heading, with a few words beside it. */
export function Section({ id, title, icon, aside, children }: { id: string; title: string; icon?: React.ReactNode; aside?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="grid scroll-mt-4 grid-cols-1 gap-3 border-t border-line pt-4 [overflow-wrap:break-word]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 id={`${id}-h`} tabIndex={-1} className="m-0 flex min-w-0 items-center gap-2 text-lg font-bold outline-offset-4 [overflow-wrap:anywhere]">
          {icon}
          {title}
        </h3>
        {aside ? <span className="ml-auto text-sm text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** A folded section, for detail most people won't need every time. */
export function More({ id, title, aside, icon, children }: { id?: string; title: string; aside?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-4 rounded-2xl border border-line">
      {/* The summary wraps under large text: the count and arrow drop below the title (STAB-12). */}
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 px-4 py-1">
        <span className="flex min-w-0 items-center gap-2 font-bold [overflow-wrap:anywhere]">
          {icon}
          {title}
        </span>
        <span className="ml-auto flex items-center gap-2 text-sm text-muted">
          {aside}
          <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-3 px-4 pb-4 [overflow-wrap:break-word]">{children}</div>
    </details>
  );
}

/** A list that shows its first few items, then "Show all". Numbering carries on in an ordered list. */
export function ShortList({ items, first, ordered, noun, className }: { items: React.ReactNode[]; first: number; ordered?: boolean; noun: string; className?: string }) {
  const [all, setAll] = useState(false);
  const id = useId();
  const shown = all ? items : items.slice(0, first);
  const List = ordered ? "ol" : "ul";
  return (
    <>
      <List id={id} className={cn("m-0", className)}>
        {shown}
      </List>
      {items.length > first ? (
        <button type="button" aria-expanded={all} aria-controls={id} onClick={() => setAll(!all)} className="min-h-11 justify-self-start px-1 text-sm font-bold text-accent underline underline-offset-4">
          {all ? "Show fewer" : `Show all ${items.length} ${noun}`}
        </button>
      ) : null}
    </>
  );
}
