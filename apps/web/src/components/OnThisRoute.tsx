"use client";
import { ChevronDown, CircleAlert, CircleX, Info, ListChecks, MapPinPlus } from "lucide-react";
import type { OnRouteGroup, OnRouteItem } from "@causeway/router";
import { GROUP_WORDS, itemMeta, onRouteAside, onRouteUrgent, whereText } from "@/lib/on-route";
import { Button } from "@/components/ui/button";

const ICON: Record<OnRouteGroup, React.ReactNode> = {
  blocked: <CircleX aria-hidden className="size-5 shrink-0 text-stop" />,
  slower: <CircleAlert aria-hidden className="size-5 shrink-0 text-caution" />,
  info: <Info aria-hidden className="size-5 shrink-0 text-muted" />,
};

/**
 * "On this route" (D-067): the facts that don't change the verdict, grouped
 * Blocked, Slower, Worth knowing. Each says whether it's live, static data or
 * reported by people, where it came from and when. It opens by itself only
 * when something is blocked or slower; otherwise the summary row says what's
 * inside ("2 worth knowing", "Nothing known").
 */
export function OnThisRoute({ items, routeId }: { items: readonly OnRouteItem[]; routeId: string }) {
  const groups = (["blocked", "slower", "info"] as const).map((g) => ({ g, list: items.filter((i) => i.group === g) })).filter((x) => x.list.length);
  const urgent = onRouteUrgent(items);
  return (
    // Keyed by route and urgency, so a newly chosen route, or one where something new is blocked, opens on its own merits.
    <details key={`${routeId}|${urgent}`} open={urgent || undefined} className="group rounded-2xl border border-line">
      {/* The summary wraps under large text, as the other sections' do (STAB-12). */}
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 px-4 py-1">
        <span className="flex min-w-0 items-center gap-2 font-bold [overflow-wrap:anywhere]">
          <ListChecks aria-hidden className="size-5" />
          On this route
        </span>
        <span className="ml-auto flex items-center gap-2 text-sm text-muted">
          {onRouteAside(items)}
          <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-4 px-4 pb-4 [overflow-wrap:break-word]">
        {groups.length ? (
          groups.map(({ g, list }) => (
            <section key={g} aria-labelledby={`onroute-${routeId}-${g}`} className="grid min-w-0 grid-cols-1 gap-2">
              <h3 id={`onroute-${routeId}-${g}`} className="m-0 flex items-center gap-2 text-base font-bold">
                {ICON[g]}
                {GROUP_WORDS[g].title}
                {/* Read as "Blocked (1 item)": the name gets a space before this part either way. */}
                <span className="sr-only">
                  ({list.length} {list.length === 1 ? "item" : "items"})
                </span>
              </h3>
              <p className="m-0 text-sm text-muted">{GROUP_WORDS[g].hint}</p>
              {/* Mappers' notes can hold a long web address: break it anywhere rather than run off the side at 200% text. */}
              <ul className="m-0 grid min-w-0 list-none grid-cols-1 gap-3 p-0 [overflow-wrap:anywhere]">
                {list.map((it) => {
                  const where = whereText(it.where);
                  return (
                    <li key={`${it.text}|${it.source}`} className="grid min-w-0 gap-0.5 border-l-2 border-line pl-3">
                      <span>{it.text}</span>
                      {where ? <span className="text-sm">{where}</span> : null}
                      <span className="text-sm text-muted">
                        <span className="sr-only">Source: </span>
                        {itemMeta(it)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        ) : (
          <p className="m-0 text-muted">Nothing blocked, slower or worth knowing on this route that we know of.</p>
        )}
      </div>
    </details>
  );
}

/**
 * "Report what's there" (FEAT-03), under each street in "What we don't know".
 * The sheet it opens already knows the street, the point and what's missing.
 */
export function ReportWhatsThere({ name, onReport }: { name: string; onReport: () => void }) {
  return (
    <Button size="md" onClick={onReport} aria-label={`Report what's there on ${name}`} className="mt-2 min-w-0 justify-self-start text-left [overflow-wrap:anywhere]">
      <MapPinPlus aria-hidden className="size-5 shrink-0" /> Report what&apos;s there
    </Button>
  );
}
