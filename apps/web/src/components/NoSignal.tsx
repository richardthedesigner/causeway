import { WifiOff } from "lucide-react";

/**
 * No signal (SMALL-06): say what still works, so nobody assumes the app has
 * stopped. Routing runs on the phone (D-017) and a city once opened is kept
 * (D-023), so routes, search and the map carry on. Live feeds pause.
 */
export function NoSignal({ city = "", compact = false }: { city?: string; compact?: boolean }) {
  return (
    <div role="status" className="mb-3 flex items-start gap-3 rounded-2xl border-2 border-ink bg-surface-2 p-3">
      <WifiOff aria-hidden className="mt-0.5 size-[24px] shrink-0" />
      <div className="grid min-w-0 gap-1">
        <p className="m-0 font-bold">No signal</p>
        {compact ? (
          <p className="m-0 text-sm">Navigation carries on. Live lift and flood news will catch up when you&apos;re back online.</p>
        ) : (
          <>
            <p className="m-0 text-sm">Routes, search and the map for {city} still work from this phone.</p>
            <p className="m-0 text-sm text-muted">Paused until you&apos;re back online: lift status, flood warnings, street works, the weather, addresses we don&apos;t have, and sharing notes. Routes can&apos;t know about a lift outage or a flood since you lost signal.</p>
          </>
        )}
      </div>
    </div>
  );
}
