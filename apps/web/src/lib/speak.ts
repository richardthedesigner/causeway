/**
 * How often navigation speaks (SMALL-03): off, hazards only (steep parts,
 * setts, missing data, kerbs, bridges, getting off, going off the route and
 * arriving), or every turn as well. Kept on
 * the phone, like every other setting.
 */
export type SpeakMode = "off" | "hazards" | "all";

const KEY = "causewayside.speak.v1";

export const SPEAK_LABEL: Record<SpeakMode, string> = { off: "Speak: off", hazards: "Hazards only", all: "Every turn" };
/** The button steps through them in this order. */
export const SPEAK_NEXT: Record<SpeakMode, SpeakMode> = { off: "hazards", hazards: "all", all: "off" };

export function loadSpeak(): SpeakMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "hazards" || v === "all" ? v : "off";
  } catch {
    return "off";
  }
}

export function saveSpeak(m: SpeakMode) {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* not kept: it starts off next time */
  }
}

/** Whether to say this announcement aloud. Hazards only still says arriving, getting off and being off the route. */
export function shouldSpeak(m: SpeakMode, kind: "arrive" | "alight" | "off-route" | "hazard" | "turn" | null): boolean {
  return m === "all" || (m === "hazards" && kind !== null && kind !== "turn");
}
