"use client";
import { mergeNotes, type UserNote } from "@causeway/graph";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteNote, deviceAuthor, loadNotes, markShared, type LocalNote } from "./notes-store";
import { loadReports, markSent } from "./reports";
import { deleteSharedNote, fetchSharedNotes, flagNote, pushNote, pushReport, sharing, type FlagReason } from "./sync";

export type SharedState = "off" | "loading" | "ok" | "offline";

/**
 * Notes for one city: yours from this device, plus everyone's once sharing
 * is on (D-028). Anything not yet sent (notes and reports) goes up whenever
 * the city loads or you come back online.
 */
export function useNotes(city: string) {
  const [local, setLocal] = useState<LocalNote[]>([]);
  const [shared, setShared] = useState<UserNote[]>([]);
  const [author, setAuthor] = useState("");
  const [state, setState] = useState<SharedState>(sharing ? "loading" : "off");

  const refreshLocal = useCallback(() => setLocal(loadNotes()), []);

  const sync = useCallback(async () => {
    if (!sharing) return;
    const me = deviceAuthor();
    for (const n of loadNotes().filter((x) => !x.sharedAt)) if (await pushNote(n)) markShared(n.id);
    for (const r of loadReports().filter((x) => !x.sentAt)) if (await pushReport(r)) markSent(r.id);
    refreshLocal();
    try {
      setShared(await fetchSharedNotes(city, me));
      setState("ok");
    } catch {
      setState("offline");
    }
  }, [city, refreshLocal]);

  useEffect(() => {
    setAuthor(deviceAuthor());
    refreshLocal();
    void sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [refreshLocal, sync]);

  const notes = useMemo(() => mergeNotes(local, shared).filter((n) => n.city === city), [local, shared, city]);

  return {
    notes,
    author,
    sharing: state,
    /** After the sheet saves a note on the device: show it now, share it in the background. */
    saved: () => {
      refreshLocal();
      void sync();
    },
    remove: async (id: string) => {
      deleteNote(id);
      setShared((s) => s.filter((n) => n.id !== id));
      refreshLocal();
      await deleteSharedNote(id);
    },
    flag: async (id: string, reason: FlagReason) => {
      const ok = await flagNote(id, reason);
      if (ok) setShared((s) => s.filter((n) => n.id !== id));
      return ok;
    },
  };
}
