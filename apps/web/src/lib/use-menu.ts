import { useEffect, useRef, useState } from "react";

/**
 * One open menu at a time; Escape or a tap elsewhere closes it and returns
 * focus to its button. A menu drawn outside `root` (in a portal) passes its
 * panel as `inside`, so taps on it don't count as elsewhere.
 */
export function useMenu(inside?: React.RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && !inside?.current?.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      root.current?.querySelector<HTMLButtonElement>(`[data-menu="${open}"]`)?.focus();
      setOpen(null);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  return { open, setOpen, toggle, root };
}
