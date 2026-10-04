/**
 * Read OpenStreetMap opening_hours for the common forms ("Mo-Fr 09:00-17:30;
 * Sa 10:00-16:00; Su off", "24/7", "Mo-Su 11:00-01:00") and say whether a place
 * is open at a given time, in UK local time. Anything we can't read fully
 * (months, sunrise, comments, "open end") gives null: we say the hours as
 * mapped rather than guess. Public holidays are unknown to us, so rules for
 * them are skipped and the result says the hours may differ.
 */

/** Minutes from midnight, per weekday (0 = Monday). An end past 1440 runs into the next day. */
export interface Hours {
  days: [number, number][][];
  /** A rule for public holidays was skipped. */
  holidays: boolean;
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

function daySet(sel: string): { days: number[]; ph: boolean } | null {
  const days = new Set<number>();
  let ph = false;
  for (const part of sel.split(",")) {
    if (part === "PH") {
      ph = true;
      continue;
    }
    const [a, b] = part.split("-");
    const i = DAYS.indexOf(a!),
      j = b === undefined ? i : DAYS.indexOf(b);
    if (i < 0 || j < 0) return null;
    for (let k = i; ; k = (k + 1) % 7) {
      days.add(k);
      if (k === j) break;
    }
  }
  return { days: [...days], ph };
}

function spans(s: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const t of s.split(",")) {
    const m = TIME.exec(t.trim());
    if (!m) return null;
    const a = Number(m[1]) * 60 + Number(m[2]);
    let b = Number(m[3]) * 60 + Number(m[4]);
    if (a > 24 * 60 || b > 48 * 60) return null;
    if (b <= a) b += 24 * 60;
    out.push([a, b]);
  }
  return out;
}

export function parseHours(raw: string | undefined): Hours | null {
  if (!raw) return null;
  const s = raw.trim();
  const all = (): [number, number][][] => DAYS.map(() => [[0, 24 * 60]]);
  if (s === "24/7") return { days: all(), holidays: false };
  const days: [number, number][][] = DAYS.map(() => []);
  let holidays = false;
  // ";" starts a rule that replaces earlier ones for its days; "," after a time or "off" adds one.
  for (const rule of s.split(/\s*;\s*/)) {
    for (const [n, part] of rule.split(/(?<=\d|off|closed)\s*,\s*(?=[A-Z])/).entries()) {
      const p = part.trim();
      if (!p) continue;
      const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?|PH)(?:,(?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?|PH))*)?\s*(.*)$/.exec(p)!;
      const sel = m[1] ? daySet(m[1]) : { days: [0, 1, 2, 3, 4, 5, 6], ph: false };
      if (!sel) return null;
      const rest = m[2]!.trim();
      const closed = rest === "off" || rest === "closed";
      const times = closed ? [] : rest === "" && m[1] ? [[0, 24 * 60] as [number, number]] : spans(rest);
      if (!times) return null;
      if (sel.ph) holidays = true;
      for (const d of sel.days) days[d] = n === 0 ? [...times] : [...days[d]!, ...times];
    }
  }
  return { days, holidays };
}

const UK = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const WEEKDAY: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function ukNow(d: Date): { day: number; min: number } {
  const p = Object.fromEntries(UK.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: WEEKDAY[p.weekday!]!, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export interface HoursStatus {
  open: boolean;
  /** "Open until 17:30", "Closed, opens tomorrow 09:00". */
  text: string;
}

/** Open or closed at this time, and the next change. */
export function hoursAt(h: Hours, when: Date): HoursStatus {
  const { day, min } = ukNow(when);
  // Spans from yesterday to a week ahead on one timeline (minutes from today's midnight), merged where they touch.
  const line: [number, number][] = [];
  for (let k = -1; k <= 7; k++) for (const [a, b] of h.days[(day + k + 7) % 7]!) line.push([k * 1440 + a, k * 1440 + b]);
  line.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of line) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const note = h.holidays ? " (may differ on bank holidays)" : "";
  const now = merged.find(([a, b]) => a <= min && min < b);
  if (now) {
    const left = now[1] - min;
    if (left >= 6 * 1440) return { open: true, text: `Open 24 hours${note}` };
    const day2 = Math.floor(now[1] / 1440);
    const until = day2 >= 2 || (day2 === 1 && now[1] % 1440 > 6 * 60) ? `${day2 === 1 ? "tomorrow " : `${DAY_NAMES[(day + day2) % 7]} `}${hhmm(now[1])}` : hhmm(now[1]);
    return { open: true, text: `Open until ${until}${left <= 30 ? ", closing soon" : ""}${note}` };
  }
  const next = merged.find(([a]) => a > min);
  if (!next) return { open: false, text: `Closed${note}` };
  const k = Math.floor(next[0] / 1440);
  const on = k === 0 ? "" : k === 1 ? "tomorrow " : `${DAY_NAMES[(day + k) % 7]} `;
  return { open: false, text: `Closed, opens ${on}${hhmm(next[0])}${note}` };
}

/** For display: the status when we can read the hours, else the hours as mapped. */
export function hoursText(raw: string | undefined, when: Date): { open: boolean | null; text: string } | null {
  if (!raw) return null;
  const h = parseHours(raw);
  return h ? hoursAt(h, when) : { open: null, text: `Hours as mapped: ${raw}` };
}
