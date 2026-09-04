"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getSafeLocalStorage, getSoundMuted, setSoundMuted } from "./sound-muted-storage";

// Module-level cache + subscriber set: every component calling this hook
// (the mute button, `RoomCanvas`'s own mute check) shares one source of
// truth, kept in sync within the same tab the instant either one toggles it
// — without that, the button could show "muted" while `RoomCanvas` still
// played sound, until some unrelated re-render happened to re-read storage.
// Cross-tab sync is deliberately out of scope (Story 3.6's scope decision:
// per-browser preference, not synced) — no `storage` event listener here.
let cached: boolean | null = null;
const listeners = new Set<() => void>();

function readCached(): boolean {
  if (cached === null) {
    cached = getSoundMuted(getSafeLocalStorage());
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Server snapshot is always "unmuted" (matches the product default) so SSR
// and the first hydration render agree — same reasoning as
// `first-access-tutorial.tsx`'s `useSyncExternalStore` usage for
// `sessionStorage`.
export function useSoundMuted(): [boolean, (muted: boolean) => void] {
  const muted = useSyncExternalStore(subscribe, readCached, () => false);

  const setMuted = useCallback((next: boolean) => {
    cached = next;
    setSoundMuted(next, getSafeLocalStorage());
    for (const listener of listeners) {
      listener();
    }
  }, []);

  return [muted, setMuted];
}
