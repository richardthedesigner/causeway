"use client";
import { Accessibility, Building2, Coffee, Hash, Home, MapPin, Navigation, Search, Signpost, Toilet, TrainFront } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { Place } from "@/lib/plan-types";
import { formatPostcode, inZones, lookupPostcode, photon, search, type Hit, type Index } from "@/lib/search";

interface Props {
  label: string;
  index: Index | null;
  /** Shown before anything is typed. */
  suggestions: Place[];
  near: { lon: number; lat: number };
  bbox: [number, number, number, number];
  cityName: string;
  excludeId?: string;
  onPick: (p: Place) => void;
  autoFocus?: boolean;
  onUseLocation?: () => void;
  /** Sits inside the search bar, after the field (who the routes are for). */
  trailing?: React.ReactNode;
  /** Shown instead of the suggestions before anything is typed (recent places). */
  emptyState?: React.ReactNode;
  onFocus?: () => void;
}

const SHORTCUTS = ["Accessible toilets", "Step-free cafés", "Stations", "Pharmacies"];

const metres = (m: number) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

function Icon({ p }: { p: Place }) {
  const k = p.kind;
  const cls = "size-5 shrink-0 text-muted";
  if (/^Toilets/.test(k)) return <Toilet aria-hidden className={cls} />;
  if (/^(Station|Underground|DLR|Railway station|Tram stop|Station entrance)/.test(k)) return <TrainFront aria-hidden className={cls} />;
  if (/^(Café|Restaurant|Pub|Bar|Takeaway)/.test(k)) return <Coffee aria-hidden className={cls} />;
  if (/^Street/.test(k)) return <Signpost aria-hidden className={cls} />;
  if (/^Address/.test(k)) return <Home aria-hidden className={cls} />;
  if (/^Postcode/.test(k)) return <Hash aria-hidden className={cls} />;
  if (p.venue) return <Building2 aria-hidden className={cls} />;
  return <MapPin aria-hidden className={cls} />;
}

/**
 * Search places, streets, addresses and postcodes on the device, with live
 * Photon and postcodes.io lookups for what the bundled index misses. Category
 * questions ("accessible toilet") list the nearest matches. cmdk gives
 * arrow-key and screen reader list semantics.
 */
export { Icon as PlaceIcon };

export function PlaceSearch({ label, index, suggestions, near, bbox, cityName, excludeId, onPick, autoFocus, onUseLocation, trailing, emptyState, onFocus }: Props) {
  const [q, setQ] = useState("");
  const [live, setLive] = useState<{ q: string; places: Place[]; outside: number } | null>(null);
  const local = useMemo(() => (index && q.trim() ? search(index, q, near) : null), [index, q, near]);

  // Live lookups only when the bundled index comes up short, debounced, and only for places inside the mapped area.
  useEffect(() => {
    setLive(null);
    const query = q.trim();
    if (!index || query.length < 3) return;
    const pc = formatPostcode(query);
    const needPostcode = pc && !local?.hits.some((h) => h.place.name === pc);
    const needPhoton = !pc && !local?.query.cats && (local?.hits.length ?? 0) < 5;
    if (!needPostcode && !needPhoton) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const found = needPostcode ? [await lookupPostcode(pc!, ctl.signal)].filter((p): p is Place => !!p) : await photon(query, near, bbox, ctl.signal);
        const inside = found.filter((p) => inZones(index, p));
        setLive({ q: query, places: inside, outside: found.length - inside.length });
      } catch {
        /* offline or blocked: the local results stand */
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const hits: Hit[] = (local?.hits ?? []).filter((h) => h.place.id !== excludeId);
  const liveExtra = (live?.q === q.trim() ? live.places : []).filter((p) => !hits.some((h) => h.place.name === p.name && Math.abs(h.place.lat - p.lat) < 0.0005));
  const cat = local?.query.cats;
  const accessFilter = !!local?.query.accessible;

  return (
    <Command label={label} className="gap-2" shouldFilter={false}>
      <div className="flex min-h-14 flex-wrap items-center gap-x-2 rounded-2xl border border-line bg-surface-2 py-1 pr-2 pl-4 focus-within:border-accent">
        <Search aria-hidden className="size-5 shrink-0 text-muted" />
        <CommandInput placeholder={label} autoFocus={autoFocus} aria-label={label} value={q} onValueChange={setQ} onFocus={onFocus} className="min-h-12 min-w-0 flex-1 basis-32 border-0 bg-transparent px-0" />
        {trailing}
      </div>
      {!q.trim() ? (
        <div className="flex flex-wrap gap-2" aria-label="Quick searches">
          {SHORTCUTS.map((s) => (
            <button key={s} type="button" onClick={() => { setQ(s); onFocus?.(); }} className="min-h-11 rounded-full border border-line px-4 text-base hover:border-ink">
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {accessFilter && cat ? (
        <p className="m-0 text-sm text-muted" aria-live="polite">
          Places mapped as wheelchair accessible in OpenStreetMap, nearest first.
          {local!.hiddenNotMapped ? ` ${local!.hiddenNotMapped} more have no or different access information.` : ""}
        </p>
      ) : null}
      <CommandList className="max-h-[42dvh] overflow-y-auto">
        {q.trim() ? (
          <CommandEmpty className="px-3 py-4 text-muted">{index ? `Nothing found in the mapped part of ${cityName}.` : "Loading places…"}</CommandEmpty>
        ) : null}
        {onUseLocation && !q.trim() ? (
          <CommandItem value="Use my location" onSelect={onUseLocation}>
            <Navigation aria-hidden className="size-5 shrink-0 text-accent" />
            <span className="font-bold">Use my location</span>
          </CommandItem>
        ) : null}
        {!q.trim() && emptyState ? emptyState : null}
        {!q.trim() && !emptyState
          ? suggestions
              .filter((p) => p.id !== excludeId)
              .map((p) => (
                <CommandItem key={p.id} value={p.id} onSelect={() => onPick(p)}>
                  <Icon p={p} />
                  <span className="min-w-0">
                    <span className="block truncate">{p.name}</span>
                    <span className="block truncate text-sm text-muted">{p.kind}</span>
                  </span>
                </CommandItem>
              ))
          : null}
        {hits.map((h) => (
          <CommandItem key={h.place.id} value={h.place.id} onSelect={() => onPick(h.place)}>
            <Icon p={h.place} />
            <span className="min-w-0">
              <span className="block truncate">{h.place.name}</span>
              <span className="block truncate text-sm text-muted">
                {h.place.kind} / {metres(h.metres)}
              </span>
              {h.place.facts ? (
                <span className="flex items-center gap-1 truncate text-sm text-muted">
                  <Accessibility aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{h.place.facts[0]}</span>
                </span>
              ) : null}
            </span>
          </CommandItem>
        ))}
        {liveExtra.length ? (
          <CommandGroup heading={<span className="px-3 text-sm text-muted">More results, no access information</span>}>
            {liveExtra.map((p) => (
              <CommandItem key={p.id} value={p.id} onSelect={() => onPick(p)}>
                <Icon p={p} />
                <span className="min-w-0">
                  <span className="block truncate">{p.name}</span>
                  <span className="block truncate text-sm text-muted">{p.kind}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
      {live?.outside && live.q === q.trim() ? <p className="m-0 text-sm text-muted">{live.outside === 1 ? "1 match is" : `${live.outside} matches are`} outside the area we have routes for yet.</p> : null}
    </Command>
  );
}
