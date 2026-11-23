/**
 * The design v3 flag (FEAT-65, docs/handoff/DESIGN_V3_HANDOFF.md). Off by default.
 *
 * On when:
 * - the build sets `NEXT_PUBLIC_DESIGN_V3=1`; or
 * - the address has `?v3` (or `?v3=1`), which is then remembered on this phone
 *   under `cw-design-v3`; or
 * - it was remembered on an earlier visit.
 *
 * `?v3=0` forgets it again. It can't turn off a build that sets the variable.
 *
 * The export never renders in a browser, so there it only knows the build
 * variable. A component that reads the flag should do so after it mounts, or
 * the first paint won't match the exported page.
 */
import { defaultStore, type Store } from "./stored";

export const DESIGN_V3_KEY = "cw-design-v3";

export interface DesignFlagSource {
  /** `location.search`, with or without the leading "?". */
  search?: string;
  store?: Store;
  /** The value of `NEXT_PUBLIC_DESIGN_V3`. */
  env?: string;
}

/** Work the flag out from its sources, and remember or forget what the address asks for. Never throws. */
export function readDesignV3({ search = "", store, env }: DesignFlagSource): boolean {
  let asked: string | null = null;
  try {
    asked = new URLSearchParams(search).get("v3");
  } catch {
    asked = null;
  }
  if (asked !== null) {
    const on = asked !== "0";
    try {
      // "0" rather than removing the key: the same two calls every other store uses.
      store?.setItem(DESIGN_V3_KEY, on ? "1" : "0");
    } catch {
      /* private mode or no room: it still applies to this visit */
    }
    return on || env === "1";
  }
  if (env === "1") return true;
  try {
    return store?.getItem(DESIGN_V3_KEY) === "1";
  } catch {
    return false;
  }
}

let cached: boolean | undefined;

/** Is design v3 on? Read once per page load. */
export function designV3(): boolean {
  const env = process.env.NEXT_PUBLIC_DESIGN_V3;
  if (typeof window === "undefined") return env === "1";
  if (cached === undefined) {
    let search = "";
    try {
      search = window.location.search;
    } catch {
      search = "";
    }
    cached = readDesignV3({ search, store: defaultStore(), env });
  }
  return cached;
}
