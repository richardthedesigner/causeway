"use client";
import { ChevronLeft, CircleCheck, CircleHelp, CircleX, Volume2 } from "lucide-react";
import type { DistanceUnit } from "@causeway/profile";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { VerdictPill, type VerdictKind } from "@/components/RouteStrip";
import type { PlannedRoute, PlanResult } from "@/lib/plan-types";
import { flagLine, momentLine, noteLine, readAloud, routeVerdict, unfoldedSentence } from "@/lib/route-verdict";
import { cn } from "@/lib/utils";
import { bandDelayMs, easeHop, easeOut, journeyKey, openingView, seenThisVisit, stoneTarget, type RouteView } from "./route-moment";
import { Stone, type StoneState } from "./Stone";
import { StreetBandList } from "./StreetBand";
import styles from "./unfold.module.css";

/** The stone's renders are 676 by 550. */
const RATIO = 550 / 676;
const UNFOLD_ID = "v3-unfold";
const SWIPE_PX = 40;
/** Motion table: the stone shrinks in 350 ms; it hops in 700 ms after 200 ms; folding runs 700 ms with no delays. */
const SHRINK_MS = 350;
const HOP_MS = 700;
const HOP_DELAY_MS = 200;
const FOLD_MS = 700;
const FADE_MS = 200;

/** A stone's box on screen: top left corner and width. */
interface Box {
  x: number;
  y: number;
  w: number;
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The biggest stone that fits a box, centred in it. */
function fit(left: number, top: number, width: number, height: number): Box {
  const w = Math.max(0, Math.floor(Math.min(width, height / RATIO)));
  return { x: left + (width - w) / 2, y: top + (height - w * RATIO) / 2, w };
}

/** The stone's box on its band, on screen now (a band rising carries it along). */
function targetOnScreen(root: HTMLElement | null): Box | null {
  const t = root?.querySelector<HTMLElement>("[data-stone-target]");
  if (!t) return null;
  const r = t.getBoundingClientRect();
  return fit(r.left, r.top, r.width, r.height);
}

/**
 * The stone's box on its band, inside `root`, from layout alone: offsets ignore
 * the bands' rise, so the landed stone sits where its band comes to rest.
 */
function targetIn(root: HTMLElement): Box | null {
  const t = root.querySelector<HTMLElement>("[data-stone-target]");
  if (!t) return null;
  let x = 0;
  let y = 0;
  let e: HTMLElement | null = t;
  while (e && e !== root) {
    x += e.offsetLeft;
    y += e.offsetTop;
    e = e.offsetParent as HTMLElement | null;
  }
  if (e !== root) {
    const a = root.getBoundingClientRect();
    const b = t.getBoundingClientRect();
    return fit(b.left - a.left, b.top - a.top, b.width, b.height);
  }
  return fit(x, y, t.offsetWidth, t.offsetHeight);
}

/**
 * The stone on its band, measured from the band's box after layout and again
 * whenever the list changes size. Goes beside the list, inside a positioned box.
 */
function PlacedStone({ state, shown = true, layoutKey, stoneRef }: { state: StoneState; shown?: boolean; layoutKey: string; stoneRef?: RefObject<HTMLSpanElement | null> }) {
  const self = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const root = self.current?.parentElement;
    if (!root) return;
    const place = () => setBox(targetIn(root));
    place();
    const seen = new ResizeObserver(place);
    seen.observe(root);
    return () => seen.disconnect();
  }, [layoutKey]);
  const ok = !!box && box.w > 0;
  return (
    <span
      ref={(el) => {
        self.current = el;
        if (stoneRef) stoneRef.current = el;
      }}
      className={cn(styles.placed, (!shown || !ok) && styles.away)}
      style={ok ? { left: box.x, top: box.y } : undefined}
    >
      {ok ? <Stone state={state} size={box.w} /> : null}
    </span>
  );
}

/** Swipes of 40 px or more, by touch or mouse. A swipe that starts on a control is the control's. */
function useSwipe(ref: RefObject<HTMLElement | null>, on: { up?: () => void; down?: () => void; canStart?: () => boolean }) {
  const latest = useRef(on);
  useEffect(() => {
    latest.current = on;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let y0: number | null = null;
    const start = (y: number, target: EventTarget | null) => {
      const onControl = target instanceof Element && !!target.closest("button, a, input, select, textarea, summary");
      y0 = onControl || latest.current.canStart?.() === false ? null : y;
    };
    const end = (y: number) => {
      if (y0 === null) return;
      const dy = y - y0;
      y0 = null;
      if (dy <= -SWIPE_PX) latest.current.up?.();
      else if (dy >= SWIPE_PX) latest.current.down?.();
    };
    const touchStart = (e: TouchEvent) => start(e.touches[0]!.clientY, e.target);
    const touchEnd = (e: TouchEvent) => end(e.changedTouches[0]!.clientY);
    // Touch is handled by its own events, which a scroll can't cancel the way it cancels pointer events.
    const down = (e: PointerEvent) => e.pointerType !== "touch" && start(e.clientY, e.target);
    const up = (e: PointerEvent) => e.pointerType !== "touch" && end(e.clientY);
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchend", touchEnd);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchend", touchEnd);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
    };
  }, [ref]);
}

export interface OtherWay {
  id: string;
  title: string;
  minutes: number;
  /** "1.2 km · max 5%", as today's rows say it. */
  meta: string;
  verdict: VerdictKind;
}

interface Props {
  result: PlanResult;
  /** The route on show: the selected route, or the closest route when nothing fits. */
  route: PlannedRoute | null;
  /** The destination's name. */
  to: string;
  /** The route's title for screen readers ("Best for you"); empty when nothing fits. */
  title: string;
  unit: DistanceUnit;
  /** The journey on screen: where it starts and ends (place ids). */
  fromId: string;
  toId: string;
  planning: boolean;
  onStart: () => void;
  /** Open the sheet to 94%. */
  onSheetFull?: () => void;
  others: OtherWay[];
  onSelect: (id: string) => void;
  /** Today's card lines that say what changed the route or needs doing, placed under the bands. */
  lines?: ReactNode;
  /** Nothing fits: today's "What you can do", in v3. */
  whatYouCanDo?: ReactNode;
}

/**
 * The route moment, and the way it unfolds into (design v3, FEAT-68). Phone
 * layout only, inside the sheet.
 *
 * - The moment: the word, the flag, where and how long, the stone and "Pull up
 *   for the way", on the ground over the dimmed map. The sheet waits hidden
 *   under it at 94%, laid out, so the stone's band can be measured.
 * - Unfolded: the top of the sheet. Destination, the time as a big figure, the
 *   pill, one sentence, the bands with the stone on its band, the note, today's
 *   lines and other ways. Back, Read aloud and GO in a bar at the bottom of the
 *   screen. Nothing to tap at the top (D-035, D-036).
 *
 * A new journey opens on the moment once; a journey this visit has shown opens
 * unfolded (`openingView`). Swipe up or the button unfolds; swipe down, Back or
 * Escape folds. Whichever state is hidden is `inert`.
 */
export function RouteUnfold(p: Props) {
  const { result, route, unit } = p;
  const journey = journeyKey(p.fromId, p.toId);
  const [phase, setPhase] = useState<{ key: string; view: Exclude<RouteView, "loading"> } | null>(null);
  let view: RouteView;
  if (phase?.key === journey) view = phase.view;
  else {
    // A new journey on screen: decide once what it opens on (React's pattern for state that follows a prop).
    view = openingView(journey, seenThisVisit, true, p.planning);
    if (view !== "loading") setPhase({ key: journey, view });
  }

  const verdict = routeVerdict(result, route);
  const bands = route?.streetBands ?? [];
  const at = stoneTarget(bands, verdict.stone);
  const flag = flagLine(result, route, unit);
  const note = noteLine(result, route);
  const FlagIcon = verdict.stone === "fits" ? CircleCheck : verdict.stone === "unsure" ? CircleHelp : CircleX;

  const momentRef = useRef<HTMLDivElement>(null);
  const momentBody = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLHeadingElement>(null);
  const momentStone = useRef<HTMLSpanElement>(null);
  const pull = useRef<HTMLButtonElement>(null);
  const section = useRef<HTMLElement>(null);
  const dest = useRef<HTMLHeadingElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const bandsRef = useRef<HTMLDivElement>(null);
  const landed = useRef<HTMLSpanElement>(null);
  const go = useRef<HTMLButtonElement>(null);
  const flyer = useRef<HTMLSpanElement>(null);

  // Read on mount: the export never knows the screen (see design-flag.ts).
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    const big = parseFloat(getComputedStyle(document.documentElement).fontSize) >= 20;
    setSize(Math.round(Math.min(big ? 150 : 260, Math.max(120, innerWidth - 96))));
  }, []);
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => setCanSpeak("speechSynthesis" in window), []);

  /** Where the stone is: in the moment, in flight, or on its band. */
  const [stoneAt, setStoneAt] = useState<"moment" | "flying" | "band">(view === "open" ? "band" : "moment");
  const [said, setSaid] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const focusNext = useRef<"go" | "pull" | "word" | null>(null);
  const folding = useRef(false);
  const flight = useRef<{ from: Box; to: () => Box | null; fold: boolean; endAt: number } | null>(null);

  // Remember the journey as shown, and open the sheet fully for it.
  const shownKey = phase?.key ?? null;
  const sheetFull = useRef(p.onSheetFull);
  useEffect(() => {
    sheetFull.current = p.onSheetFull;
  });
  useEffect(() => {
    if (!shownKey) return;
    seenThisVisit.add(shownKey);
    sheetFull.current?.();
    if (phase?.view === "moment") focusNext.current = "word";
    setStoneAt(phase?.view === "open" ? "band" : "moment");
  }, [shownKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The sheet: hidden under the moment, shown unfolded. Folding keeps it until the way has gone back.
  useLayoutEffect(() => {
    const sheet = section.current?.closest<HTMLElement>("[data-vaul-drawer]");
    if (!sheet) return;
    if (view !== "moment") {
      sheet.style.visibility = "";
      return;
    }
    if (!folding.current) {
      sheet.style.visibility = "hidden";
      return;
    }
    const t = setTimeout(() => (sheet.style.visibility = "hidden"), reduced() ? FADE_MS : FOLD_MS);
    return () => clearTimeout(t);
  }, [view]);
  useEffect(() => {
    const sheet = section.current?.closest<HTMLElement>("[data-vaul-drawer]");
    return () => {
      if (sheet) sheet.style.visibility = "";
    };
  }, []);

  // Unfolded, the bar sits over the end of the sheet. Pad the list by the bar's height while it shows, so the last
  // lines (the map's credits among them) scroll up above it, by finger or by keyboard focus (FEAT-69).
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scroller = section.current?.closest<HTMLElement>("[data-route-panel]");
    const b = bar.current;
    if (view !== "open" || !scroller || !b) return;
    const pad = () => {
      scroller.style.paddingBottom = "";
      scroller.style.scrollPaddingBottom = "";
      const cs = getComputedStyle(scroller);
      const [padding, scrollPadding] = [parseFloat(cs.paddingBottom) || 0, parseFloat(cs.scrollPaddingBottom) || 0];
      scroller.style.paddingBottom = `${padding + b.offsetHeight}px`;
      scroller.style.scrollPaddingBottom = `${scrollPadding + b.offsetHeight}px`;
    };
    pad();
    const seen = new ResizeObserver(pad);
    seen.observe(b);
    return () => {
      seen.disconnect();
      scroller.style.paddingBottom = "";
      scroller.style.scrollPaddingBottom = "";
    };
  }, [view]);

  // In the moment, everything but the moment is out of reach: the map's buttons sit under the ground.
  useLayoutEffect(() => {
    if (view !== "moment") return;
    const touched: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el.hasAttribute("data-v3-layer") || (el as HTMLElement).inert) continue;
      (el as HTMLElement).inert = true;
      touched.push(el);
    }
    return () => touched.forEach((el) => ((el as HTMLElement).inert = false));
  }, [view]);

  // Focus follows the state: GO (or the heading, when there is nothing to start) on unfold, the button on fold.
  // An arriving layer can still be hidden for a frame or two as its fade starts, so try for a moment until focus lands.
  useEffect(() => {
    const next = focusNext.current;
    focusNext.current = null;
    const el = next === "go" ? (go.current ?? dest.current) : next === "pull" ? pull.current : next === "word" ? word.current : null;
    if (!el) return;
    let raf = 0;
    const until = performance.now() + 400;
    const tryFocus = () => {
      el.focus({ preventScroll: true });
      if (document.activeElement !== el && performance.now() < until) raf = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(raf);
  }, [view, shownKey]);

  // The stone's walk, frame by frame: shrink, then hop, onto a band that may still be rising.
  useLayoutEffect(() => {
    const f = flight.current;
    const el = flyer.current;
    if (!f || !el || !size) return;
    flight.current = null;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = now - t0;
      const to = f.to() ?? f.from;
      const e1 = easeOut(Math.min(1, t / SHRINK_MS));
      const w = f.from.w + (to.w - f.from.w) * e1;
      const e2 = f.fold ? easeOut(Math.min(1, t / FOLD_MS)) : easeHop(Math.min(1, Math.max(0, (t - HOP_DELAY_MS) / HOP_MS)));
      const cx = f.from.x + f.from.w / 2 + (to.x + to.w / 2 - (f.from.x + f.from.w / 2)) * e2;
      const cy = f.from.y + (f.from.w * RATIO) / 2 + (to.y + (to.w * RATIO) / 2 - (f.from.y + (f.from.w * RATIO) / 2)) * e2;
      el.style.transform = `translate(${cx - w / 2}px, ${cy - (w * RATIO) / 2}px) scale(${w / size})`;
      if (t >= f.endAt) {
        setStoneAt(f.fold ? "moment" : "band");
        return;
      }
      raf = requestAnimationFrame(step);
    };
    step(t0);
    return () => cancelAnimationFrame(raf);
  }, [stoneAt, size]);

  const unfold = useCallback(() => {
    if (view !== "moment") return;
    folding.current = false;
    const sheet = section.current?.closest<HTMLElement>("[data-vaul-drawer]");
    if (sheet) sheet.style.visibility = "";
    const scroller = section.current?.closest<HTMLElement>("[data-route-panel]");
    if (scroller) scroller.scrollTop = 0;
    p.onSheetFull?.();
    // The word heads for the pill.
    const w = word.current?.getBoundingClientRect();
    const pl = pill.current?.getBoundingClientRect();
    if (w && pl && w.height > 0) word.current!.style.setProperty("--word-to", `translate(${pl.left - w.left}px, ${pl.top - w.top}px) scale(${Math.max(0.05, pl.height / w.height)})`);
    const from = momentStone.current?.getBoundingClientRect();
    const target = at === null ? -1 : at;
    if (!reduced() && from && from.width > 0 && target >= 0 && targetOnScreen(bandsRef.current)) {
      flight.current = { from: { x: from.left, y: from.top, w: from.width }, to: () => targetOnScreen(bandsRef.current), fold: false, endAt: Math.max(HOP_DELAY_MS + HOP_MS, bandDelayMs(target) + 600) + 16 };
      setStoneAt("flying");
    } else setStoneAt("band");
    focusNext.current = "go";
    setSaid("Showing the way, street by street.");
    setPhase({ key: journey, view: "open" });
  }, [view, at, journey, p]);

  const fold = useCallback(() => {
    if (view !== "open") return;
    folding.current = true;
    if (speaking) speechSynthesis.cancel();
    const from = landed.current?.getBoundingClientRect();
    const target = momentStone.current;
    if (!reduced() && from && from.width > 0 && target) {
      flight.current = {
        from: { x: from.left, y: from.top, w: from.width },
        to: () => {
          const r = target.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width };
        },
        fold: true,
        endAt: FOLD_MS,
      };
      setStoneAt("flying");
    } else setStoneAt("moment");
    focusNext.current = "pull";
    setSaid("Showing the verdict.");
    setPhase({ key: journey, view: "moment" });
  }, [view, journey, speaking]);

  useSwipe(momentRef, {
    up: unfold,
    // With large text the moment may scroll: a swipe up unfolds once it can't scroll further.
    canStart: () => {
      const b = momentBody.current;
      return !b || b.scrollTop + b.clientHeight >= b.scrollHeight - 1;
    },
  });
  useSwipe(section, {
    down: fold,
    // Only from the top of the sheet: further down, a swipe down is a scroll.
    canStart: () => (section.current?.closest<HTMLElement>("[data-route-panel]")?.scrollTop ?? 0) <= 0,
  });

  useEffect(() => {
    if (view !== "open") return;
    const key = (e: KeyboardEvent) => {
      // Not `defaultPrevented`: the sheet (vaul) marks every Escape so, as it can't be dismissed.
      if (e.key !== "Escape") return;
      // Escape in a menu, a dialog or a list closes that, not the way.
      if (e.target instanceof Element && e.target.closest('[role="dialog"]:not([data-vaul-drawer]), [role="menu"], [role="listbox"], [role="alertdialog"]')) return;
      fold();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [view, fold]);

  useEffect(() => () => void (typeof speechSynthesis !== "undefined" && speechSynthesis.cancel()), []);
  const read = () => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(readAloud(result, p.to, route, unit));
    u.lang = "en-GB";
    u.onend = u.onerror = () => setSpeaking(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setSpeaking(true);
  };

  if (view === "loading") {
    return (
      <p className="m-0 py-6 text-center text-muted" aria-live="polite">
        Working out routes for your limits…
      </p>
    );
  }

  const open = view === "open";
  const layoutKey = `${route?.id ?? "none"}:${at}:${bands.length}`;
  const layer = typeof document === "undefined" ? null : document.body;
  return (
    <>
      <section
        ref={section}
        id={UNFOLD_ID}
        aria-labelledby="v3-unfold-h"
        data-state={view}
        data-vaul-no-drag
        inert={!open}
        className={styles.unfold}
      >
        <header className={styles.head}>
          <h2 ref={dest} id="v3-unfold-h" tabIndex={-1} className={styles.dest}>
            {p.to}
            {p.title ? <span className="sr-only">. {p.title}</span> : null}
          </h2>
          {result.status === "ok" && route ? (
            <p className={cn(styles.time, "tabular")}>
              {Math.round(route.summary.minutes)}
              <small> min</small>
            </p>
          ) : null}
          <span ref={pill} className={styles.pill}>
            <VerdictPill variant="fill" v={result.status === "ok" && route ? route.summary.verdict : "none"} />
          </span>
          <p className={styles.say}>{unfoldedSentence(result, route, unit)}</p>
        </header>
        {bands.length ? (
          <div ref={bandsRef} className={styles.bands}>
            <StreetBandList bands={bands} verdict={verdict.stone} unit={unit} stoneAt={at} />
            <PlacedStone state={verdict.stone} shown={stoneAt === "band"} layoutKey={layoutKey} stoneRef={landed} />
          </div>
        ) : null}
        <div className={styles.rest}>
          {note ? <p className={styles.note}>{note}</p> : null}
          {p.lines}
          {p.planning ? <p className={styles.note}>Updating…</p> : null}
          {p.others.length ? (
            <ul aria-label="Other ways" className="m-0 grid list-none gap-2 p-0">
              {p.others.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => p.onSelect(o.id)} className={styles.other}>
                    <span className="sr-only">Switch to </span>
                    <span className="tabular text-lg font-bold">{o.minutes} min</span>
                    <span className="min-w-0 flex-[1_1_9rem] [overflow-wrap:anywhere]">
                      <span className="block font-bold">{o.title}</span>
                      <span className="tabular block text-sm text-[var(--moment-muted)]">{o.meta}</span>
                    </span>
                    <VerdictPill variant="fill" v={o.verdict} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {p.whatYouCanDo}
        </div>
      </section>

      {layer
        ? createPortal(
            <div ref={momentRef} data-v3-layer="" data-state={view} inert={open} className={styles.moment}>
              <div aria-hidden className={styles.ground} />
              <div ref={momentBody} className={cn(styles.momentBody, size !== null && size < 200 && styles.scrolls)}>
                <h1 ref={word} tabIndex={-1} className={styles.word} style={{ color: `var(${verdict.fill})` }}>
                  {verdict.word}
                </h1>
                {flag ? (
                  <p className={styles.flag} style={{ background: `var(${verdict.fill})` }}>
                    <FlagIcon aria-hidden className="size-5 shrink-0" strokeWidth={2.6} />
                    {flag}
                  </p>
                ) : null}
                <p className={styles.line}>{momentLine(result, p.to, route)}</p>
                <span ref={momentStone} className={cn(styles.momentStone, stoneAt !== "moment" && styles.away)}>
                  {size ? <Stone state={verdict.stone} size={size} idle /> : null}
                </span>
                <button ref={pull} type="button" aria-expanded={open} aria-controls={UNFOLD_ID} onClick={unfold} className={styles.pull}>
                  <i aria-hidden />
                  Pull up for the way
                </button>
              </div>
            </div>,
            layer,
          )
        : null}

      {layer
        ? createPortal(
            <div ref={bar} data-v3-layer="" data-state={view} inert={!open} className={styles.bar}>
              <button type="button" onClick={fold} aria-label="Back to the verdict" title="Back" className={styles.iconBtn}>
                <ChevronLeft aria-hidden className="size-7" strokeWidth={2.6} />
              </button>
              {canSpeak ? (
                <button type="button" onClick={read} aria-label="Read aloud" aria-pressed={speaking} title="Read aloud" className={styles.iconBtn}>
                  <Volume2 aria-hidden className="size-6" strokeWidth={2.4} />
                </button>
              ) : null}
              {result.status === "ok" ? (
                <button ref={go} type="button" onClick={p.onStart} className={styles.go} style={{ background: `var(${verdict.fill})` }}>
                  GO
                </button>
              ) : null}
            </div>,
            layer,
          )
        : null}

      {layer && stoneAt === "flying" && size
        ? createPortal(
            <span ref={flyer} data-v3-layer="" aria-hidden className={styles.flyer}>
              <Stone state={verdict.stone} size={size} />
            </span>,
            layer,
          )
        : null}

      {layer
        ? createPortal(
            <p data-v3-layer="" aria-live="polite" className="sr-only">
              {said}
            </p>,
            layer,
          )
        : null}
    </>
  );
}

/**
 * The bands inside the route card, on the ground, with the stone on its band
 * (design v3, desktop). No moment: the docked panel stays as it is.
 */
export function RouteBands({ result, route, unit }: { result: PlanResult; route: PlannedRoute; unit: DistanceUnit }) {
  const bands = route.streetBands ?? [];
  const verdict = routeVerdict(result, route);
  const at = stoneTarget(bands, verdict.stone);
  const note = noteLine(result, route);
  if (!bands.length) return null;
  return (
    <div className="-mx-2 rounded-2xl bg-[var(--moment-ground)] py-3 text-[var(--moment-ink)] [color-scheme:dark]">
      <div className="relative">
        <StreetBandList bands={bands} verdict={verdict.stone} unit={unit} stoneAt={at} />
        <PlacedStone state={verdict.stone} layoutKey={`${route.id}:${at}:${bands.length}`} />
      </div>
      {note ? <p className="m-0 mt-3 px-4 text-sm text-[var(--moment-muted)]">{note}</p> : null}
    </div>
  );
}
