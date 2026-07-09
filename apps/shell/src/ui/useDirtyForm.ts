import { useCallback, useMemo, useRef, useState } from "react";

/** Stable JSON snapshot for dirty comparisons (sorted object keys). */
export function formSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(entry as Record<string, unknown>).sort()) {
        sorted[key] = (entry as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return entry;
  });
}

/**
 * Track whether `current` differs from a baseline snapshot.
 * Call `markClean()` after a successful save (or when loading a new baseline).
 */
export function useDirtyForm<T>(current: T): {
  dirty: boolean;
  markClean: (nextBaseline?: T) => void;
} {
  const currentSnap = useMemo(() => formSnapshot(current), [current]);
  const [baseline, setBaseline] = useState(currentSnap);
  const currentSnapRef = useRef(currentSnap);
  currentSnapRef.current = currentSnap;

  const markClean = useCallback((nextBaseline?: T) => {
    setBaseline(nextBaseline === undefined ? currentSnapRef.current : formSnapshot(nextBaseline));
  }, []);

  return {
    dirty: currentSnap !== baseline,
    markClean,
  };
}
