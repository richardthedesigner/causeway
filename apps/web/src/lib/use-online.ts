"use client";
import { useEffect, useState } from "react";

/** Whether the phone has a connection, as the browser sees it (SMALL-06). Starts true, so the first paint never says "no signal". */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
