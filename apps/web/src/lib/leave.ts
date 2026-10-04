/**
 * When you're leaving: now, or a time later today or tomorrow. Times are UK
 * local, like the cities. Routing, bus waits, the after-dark check, opening
 * hours and the weather forecast all follow it.
 */
const UK = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const UK_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

export const ukTime = (d: Date) => UK.format(d);

/** "now", "18:30", "tomorrow 08:30". */
export function leaveLabel(leave: Date | null, now = new Date()): string {
  if (!leave || leave.getTime() <= now.getTime() + 60_000) return "now";
  return UK_DAY.format(leave) === UK_DAY.format(now) ? ukTime(leave) : `tomorrow ${ukTime(leave)}`;
}

/** The next time the UK clock reads hh:mm: today if that's still ahead, else tomorrow. */
export function nextAt(hhmm: string, now = new Date()): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const want = Number(m[1]) * 60 + Number(m[2]);
  const [h, mi] = ukTime(now).split(":").map(Number) as [number, number];
  let ahead = want - (h * 60 + mi);
  if (ahead <= 0) ahead += 24 * 60;
  const t = new Date(now.getTime() + ahead * 60_000);
  t.setUTCSeconds(0, 0);
  return t;
}
