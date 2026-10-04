"use client";
import { MapPin, Navigation, TrainFront } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { Place } from "@/lib/plan-types";

interface Props {
  label: string;
  places: Place[];
  onPick: (p: Place) => void;
  autoFocus?: boolean;
  onUseLocation?: () => void;
}

/** Type-ahead over places and street names. cmdk gives arrow-key and screen reader list semantics. */
export function PlaceSearch({ label, places, onPick, autoFocus, onUseLocation }: Props) {
  return (
    <Command label={label} className="gap-2" filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}>
      <CommandInput placeholder={label} autoFocus={autoFocus} aria-label={label} />
      <CommandList className="max-h-[42dvh] overflow-y-auto">
        <CommandEmpty className="px-3 py-4 text-muted">No match in central Edinburgh yet.</CommandEmpty>
        {onUseLocation ? (
          <CommandItem value="Use my location" onSelect={onUseLocation}>
            <Navigation aria-hidden className="size-5 shrink-0 text-accent" />
            <span className="font-bold">Use my location</span>
          </CommandItem>
        ) : null}
        {places.map((p) => (
          <CommandItem key={p.id} value={`${p.name} ${p.kind}`} onSelect={() => onPick(p)}>
            {p.kind === "Railway station" ? <TrainFront aria-hidden className="size-5 shrink-0 text-muted" /> : <MapPin aria-hidden className="size-5 shrink-0 text-muted" />}
            <span className="min-w-0">
              <span className="block truncate">{p.name}</span>
              <span className="block truncate text-sm text-muted">{p.kind}</span>
            </span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}
