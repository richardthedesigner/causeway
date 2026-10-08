/**
 * What community reports do to a route (FEAT-25, D-083). One rule per
 * category, driven by the profile, so a missing dropped kerb blocks a
 * wheelchair and only slows someone walking.
 *
 * - A **confirmed** report (enough people, recently: `reportLevel`) is
 *   treated as fact. For the people it stops, it blocks the edge.
 * - A **reported** one (a single person, or older) only warns: a small
 *   penalty and a line in the explanation. One person can't close a street.
 * - Good reports never make an unknown known and never lower travel time.
 *   A confirmed one takes up to half off the unknown-risk penalty on its
 *   edge, the same rule as good notes (D-026).
 */
import type { CommunityCategory, CommunitySignal } from "@causeway/graph";
import type { Profile } from "@causeway/profile";
import type { Reason } from "./cost.js";

const wheeled = (p: Profile) => p.maxSteps === 0;
const stepFree = (p: Profile) => p.maxSteps < 10 || !p.escalators;

interface Rule {
  /** Does a confirmed report stop this person? */
  blocks: (p: Profile) => boolean;
  /** Penalty, seconds, when it applies but doesn't block. `s` is the edge's travel time. */
  penalty: (p: Profile, s: number) => number;
  /** Words for an exclusion. */
  blocked: string;
}

const BAD: Partial<Record<CommunityCategory, Rule>> = {
  "no-dropped-kerb": { blocks: (p) => p.maxKerbCm < 6, penalty: (p) => (p.maxKerbCm < 10 ? 45 : 10), blocked: "no dropped kerb" },
  steps: { blocks: (p) => p.maxSteps === 0, penalty: (p, s) => (stepFree(p) ? 60 : s * 0.2), blocked: "steps" },
  "broken-lift": { blocks: stepFree, penalty: (p) => (stepFree(p) ? 120 : 20), blocked: "lift out of order" },
  "narrow-pavement": { blocks: () => false, penalty: (p, s) => s * (wheeled(p) ? 1 : 0.2) + (wheeled(p) ? 30 : 0), blocked: "too narrow" },
  "blocked-pavement": { blocks: wheeled, penalty: (p, s) => s * 0.5 + (wheeled(p) ? 60 : 20), blocked: "pavement blocked" },
  "rough-surface": { blocks: () => false, penalty: (p, s) => s * (wheeled(p) ? 0.6 : 0.2), blocked: "rough surface" },
  steep: { blocks: () => false, penalty: (p, s) => s * (wheeled(p) ? 0.6 : 0.2), blocked: "steep" },
};

/** An unconfirmed report counts this much of the confirmed penalty: enough to lean away, never enough to send you far round. */
export const UNCONFIRMED_SHARE = 0.25;
/** A confirmed good report takes up to this much off the edge's unknown-risk penalty. */
const GOOD_MAX = 0.5;

export type CommunityOutcome = { exclude: Reason } | { reasons: Reason[]; penalty: number };

/**
 * Apply the community reports on one edge. `unknownRisk` is the edge's
 * unknown-risk penalty so far, which good reports may reduce.
 * `ignoreClosures` turns blocks into nothing, for working out what a block
 * cut off (as for live closures, D-061).
 */
export function communityCost(sigs: readonly CommunitySignal[], p: Profile, seconds: number, unknownRisk: number, ignoreClosures = false): CommunityOutcome {
  const reasons: Reason[] = [];
  let penalty = 0;
  let good = 0;
  for (const s of sigs) {
    const rule = BAD[s.category];
    if (rule) {
      if (s.level === "confirmed" && rule.blocks(p)) {
        if (ignoreClosures) continue;
        return { exclude: { kind: "excluded", attr: "community", detail: `${rule.blocked}, confirmed by people (${s.detail})`, seconds: Infinity } };
      }
      const full = rule.penalty(p, seconds);
      const pen = Math.round(s.level === "confirmed" ? full : full * UNCONFIRMED_SHARE);
      if (pen <= 0) continue;
      penalty += pen;
      reasons.push({ kind: "penalty", attr: "community", detail: s.level === "confirmed" ? `confirmed by people: ${s.detail}` : `reported, not confirmed yet: ${s.detail}`, seconds: pen });
    } else if (s.level === "confirmed") {
      good = Math.max(good, s.confidence);
    }
  }
  if (good > 0 && unknownRisk > 0) {
    const off = Math.round(unknownRisk * Math.min(GOOD_MAX, good * GOOD_MAX));
    if (off > 0) {
      penalty -= off;
      reasons.push({ kind: "penalty", attr: "community", detail: `people confirm it's fine: ${sigs.find((s) => !BAD[s.category])!.detail}`, seconds: -off });
    }
  }
  return { reasons, penalty };
}
