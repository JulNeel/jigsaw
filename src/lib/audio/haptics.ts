const PLACEMENT_HAPTIC_PATTERN_MS = 15;

// `navigator.vibrate()` has no iOS Safari support at all (a platform
// limitation, not a bug) — feature-detected and silently a no-op where
// unavailable. Progressive enhancement only, never blocks or gates the
// visual/sound feedback (Story 3.6 scope decision).
export function triggerPlacementHaptic(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  navigator.vibrate(PLACEMENT_HAPTIC_PATTERN_MS);
}
