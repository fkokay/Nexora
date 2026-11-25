import { useEffect, useState, type RefObject } from "react";

export type ListMode = "full" | "narrow" | "cards";

const NARROW_BELOW = 720;
const CARDS_BELOW = 480;
const NARROW_COLUMN_LIMIT = 4;

/** Eşikler CSS'teki @container kurallarıyla aynıdır: >=720 full, <720 narrow, <480 cards. */
export function listMode(width: number): ListMode {
  if (width < CARDS_BELOW) return "cards";
  if (width < NARROW_BELOW) return "narrow";
  return "full";
}

export function cardFields(
  columns: string[],
  numeric: Set<string>,
): { title: string; sub: string[]; amount: string | null } {
  const title = columns[0] ?? "";
  const sub = columns
    .slice(1, 3)
    .filter((column) => !numeric.has(column));
  const amount = columns.slice(1).find((column) => numeric.has(column)) ?? null;
  return { title, sub, amount };
}

export function visibleColumns(columns: string[], mode: ListMode): string[] {
  return mode === "narrow" ? columns.slice(0, NARROW_COLUMN_LIMIT) : columns;
}

export function useListMode(ref: RefObject<HTMLElement | null>): ListMode {
  const [mode, setMode] = useState<ListMode>("full");
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const width = entry?.contentRect?.width ?? element.clientWidth;
      setMode(listMode(width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return mode;
}
