"use client";
import type { CommunityReport, VoteKind } from "@causeway/graph";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteCommunity, loadCommunity, loadVotes, markCommunityShared, markVoteShared, saveCommunity, saveVote, type LocalCommunityReport, type LocalVote } from "./community-store";
import { isSample, sampleReports } from "./sample-content";
import { deleteCommunityReport, fetchCommunityReports, flagCommunityReport, pushCommunityReport, pushVote, sharing, type FlagReason } from "./sync";

export type CommunityState = "off" | "loading" | "ok" | "offline";

/**
 * Community reports for one city (FEAT-35): yours from this phone, plus
 * everyone's once sharing is on. Your own vote is counted in each report's
 * votes, as everyone else sees it. Anything not yet sent goes up when the
 * city loads or you come back online. With `showSamples`, the made-up
 * sample reports (FEAT-49) are added at the end, marked `sample`; they are
 * never stored, sent or voted on.
 */
export function useCommunity(city: string, showSamples = false) {
  const [local, setLocal] = useState<LocalCommunityReport[]>([]);
  const [votes, setVotes] = useState<LocalVote[]>([]);
  const [shared, setShared] = useState<CommunityReport[]>([]);
  const [state, setState] = useState<CommunityState>(sharing ? "loading" : "off");

  const refreshLocal = useCallback(() => {
    setLocal(loadCommunity());
    setVotes(loadVotes());
  }, []);

  const sync = useCallback(async () => {
    if (!sharing) return;
    for (const r of loadCommunity().filter((x) => !x.sharedAt)) if (await pushCommunityReport(r)) markCommunityShared(r.id);
    for (const v of loadVotes().filter((x) => !x.sharedAt)) if (await pushVote(v.reportId, v.kind)) markVoteShared(v.reportId, v.at);
    refreshLocal();
    try {
      setShared(await fetchCommunityReports(city));
      setState("ok");
    } catch {
      setState("offline");
    }
  }, [city, refreshLocal]);

  useEffect(() => {
    refreshLocal();
    void sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [refreshLocal, sync]);

  const real = useMemo(() => {
    const byId = new Map<string, CommunityReport>();
    for (const r of shared) byId.set(r.id, r);
    // Yours that the server doesn't have yet (or sharing is off) still count, here.
    for (const r of local) if (!byId.has(r.id)) byId.set(r.id, { ...r, own: true, shared: !!r.sharedAt });
    const mine = new Map(votes.map((v) => [v.reportId, v]));
    return [...byId.values()]
      .filter((r) => r.city === city)
      .map((r) => {
        const v = mine.get(r.id);
        // The server leaves your own vote out of `votes`; put it back, as others see it.
        return v && !r.own ? { ...r, myVote: v.kind, votes: [...r.votes, { kind: v.kind, at: v.at }] } : r;
      });
  }, [shared, local, votes, city]);
  const reports = useMemo(() => (showSamples ? [...real, ...sampleReports(city)] : real), [real, showSamples, city]);

  return {
    /** Everyone's reports, with the samples if they're shown. For the map and the report sheet. */
    reports,
    /** Real reports only: for routes and for "someone has already reported this". */
    real,
    sharing: state,
    /** After the add sheet saves a report here: show it now, share it in the background. */
    add: (r: LocalCommunityReport) => {
      const ok = saveCommunity(r);
      refreshLocal();
      void sync();
      return ok;
    },
    vote: (reportId: string, kind: VoteKind) => {
      if (isSample({ id: reportId })) return false;
      const ok = saveVote({ reportId, kind, at: new Date().toISOString() });
      refreshLocal();
      void sync();
      return ok;
    },
    remove: async (id: string) => {
      deleteCommunity(id);
      setShared((s) => s.filter((r) => r.id !== id));
      refreshLocal();
      await deleteCommunityReport(id);
    },
    flag: async (id: string, reason: FlagReason) => {
      if (isSample({ id })) return false;
      const ok = await flagCommunityReport(id, reason);
      if (ok) setShared((s) => s.filter((r) => r.id !== id));
      return ok;
    },
  };
}
