/**
 * Community reports and votes made on this phone (FEAT-35, D-084). Kept here
 * first, so they work offline and with sharing off, then sent when they can
 * be. Everyone else's come from the server and are never stored here.
 */
import { isCategory, VOTE_KINDS, type CommunityCategory, type CommunityReport, type VoteKind } from "@causeway/graph";
import { loadStored, readList, saveStored, type StoredVersion } from "./stored";

/** A report made here. `sharedAt` once the server has it. */
export type LocalCommunityReport = CommunityReport & { sharedAt?: string };
/** Your vote on someone else's report. `sharedAt` once the server has this version of it. */
export interface LocalVote {
  reportId: string;
  kind: VoteKind;
  at: string;
  sharedAt?: string;
}

const KEY = "causewayside.community.v1";
const VOTES_KEY = "causewayside.community-votes.v1";
const FILTER_KEY = "causewayside.community-filter.v1";

const REPORTS: StoredVersion<LocalCommunityReport[]>[] = [
  {
    key: KEY,
    read: (json, dropped) =>
      readList(json, dropped, (x) => {
        const r = x as LocalCommunityReport;
        return r && typeof r.id === "string" && isCategory(r.category) && Number.isFinite(r.lon) && Number.isFinite(r.lat) ? { ...r, votes: Array.isArray(r.votes) ? r.votes : [] } : null;
      }),
  },
];
const VOTES: StoredVersion<LocalVote[]>[] = [
  { key: VOTES_KEY, read: (json, dropped) => readList(json, dropped, (x) => (x && typeof (x as LocalVote).reportId === "string" && VOTE_KINDS.includes((x as LocalVote).kind) ? (x as LocalVote) : null)) },
];

export const loadCommunity = (): LocalCommunityReport[] => loadStored(REPORTS)?.value ?? [];
export const loadVotes = (): LocalVote[] => loadStored(VOTES)?.value ?? [];

export function saveCommunity(r: LocalCommunityReport): boolean {
  return saveStored(KEY, [r, ...loadCommunity().filter((o) => o.id !== r.id)].slice(0, 200));
}
export function markCommunityShared(id: string): void {
  const r = loadCommunity().find((o) => o.id === id);
  if (r) saveCommunity({ ...r, sharedAt: new Date().toISOString(), shared: true });
}
export function deleteCommunity(id: string): boolean {
  return saveStored(KEY, loadCommunity().filter((o) => o.id !== id));
}

export function saveVote(v: LocalVote): boolean {
  return saveStored(VOTES_KEY, [v, ...loadVotes().filter((o) => o.reportId !== v.reportId)].slice(0, 1000));
}
export function markVoteShared(reportId: string, at: string): void {
  const v = loadVotes().find((o) => o.reportId === reportId && o.at === at);
  if (v) saveVote({ ...v, sharedAt: new Date().toISOString() });
}

/** What the map shows. A per-phone convenience, so it's fine if storage is blocked. */
export interface CommunityFilter {
  show: boolean;
  bad: boolean;
  good: boolean;
  /** Categories switched off. Empty: all on. */
  hidden: CommunityCategory[];
}
export const DEFAULT_FILTER: CommunityFilter = { show: true, bad: true, good: true, hidden: [] };

export function loadFilter(): CommunityFilter {
  try {
    const f = JSON.parse(localStorage.getItem(FILTER_KEY) ?? "null") as Partial<CommunityFilter> | null;
    if (!f) return DEFAULT_FILTER;
    return { show: f.show !== false, bad: f.bad !== false, good: f.good !== false, hidden: Array.isArray(f.hidden) ? f.hidden.filter(isCategory) : [] };
  } catch {
    return DEFAULT_FILTER;
  }
}
export function saveFilter(f: CommunityFilter): void {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(f));
  } catch {
    /* not remembered: fine */
  }
}
