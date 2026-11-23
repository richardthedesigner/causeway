"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { designV3 } from "@/lib/design-flag";

// Fetched only once the flag is known to be on, so with it off no v3 code, face or stone is asked for.
const Lab = dynamic(() => import("./Lab").then((m) => m.Lab), { ssr: false });

/**
 * The v3 lab (FEAT-67): every state of the v3 components, on made-up props.
 * Only with the `v3` flag (lib/design-flag.ts); otherwise there is nothing
 * here. Nothing in the app links to it.
 */
export default function V3LabPage() {
  // The flag is read after mount: the exported page never knows it (see design-flag.ts).
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => setOn(designV3()), []);
  if (on) return <Lab />;
  return (
    <main className="grid h-dvh place-items-center p-4 text-center">
      {on === false ? (
        <div>
          <h1 className="text-xl font-bold">Nothing here</h1>
          <p className="mt-2">
            <a href="/" className="inline-flex min-h-12 items-center font-bold text-accent underline">
              Back to the map
            </a>
          </p>
        </div>
      ) : null}
    </main>
  );
}
