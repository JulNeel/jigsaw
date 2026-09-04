// Synthesizes three short sounds via the Web Audio API — this repo has no
// audio asset files (scope decision: runtime synthesis over sourcing/
// licensing samples):
//   - `playWoodClick` — an "organic knock" (filtered white-noise burst),
//     the generic *drop* sound: plays every time a Participant releases a
//     piece/Cluster, anywhere on the Canvas, in the Frame or not. Never
//     implies anything about validation on its own.
//   - `playSuccessChime` — a short, bright ascending tone layered *on top*
//     of the drop sound specifically when the drop was a genuine Frame
//     lock or a genuine fusion match.
//   - `playVictorySound` (Story 3.7) — a short ascending square-wave
//     arpeggio, deliberately more "electronic" than the sine-based success
//     chime (PRD §6: "son plus électronique, à connotation victoire"),
//     played once for the whole Room when the last piece locks the Frame.
// There is deliberately no reject sound (removed 2026-09-02, user
// feedback) — a failed/untested attempt stays silent beyond the drop
// sound itself, never signaled as wrong.
// All three are tuned by ear, not spec-mandated — revisit with a real
// sample if any doesn't read as intended in practice.
export const woodClickEnvelope = {
  durationSeconds: 0.08,
  filterFrequencyHz: 700,
  filterQ: 1.2,
  peakGain: 0.35,
};

export const successChimeEnvelope = {
  durationSeconds: 0.12,
  startFrequencyHz: 550,
  endFrequencyHz: 850,
  peakGain: 0.25,
};

// A short major-triad-plus-octave arpeggio (C5-E5-G5-C6) — an ascending
// sequence of *discrete* notes, not a single sweep like `successChimeEnvelope`,
// so it reads as a bigger, more deliberate moment. `square` (not `sine`) is
// what makes it read as "electronic" rather than a variation on the organic
// wood-click/chime pair.
export const victorySoundEnvelope = {
  noteDurationSeconds: 0.09,
  frequenciesHz: [523.25, 659.25, 783.99, 1046.5],
  peakGain: 0.18,
};

let sharedContext: AudioContext | null = null;

// Lazily created: browsers require an `AudioContext` to be constructed (or
// resumed) from within a user-gesture callstack — the Participant's first
// piece drag/click satisfies that by the time a placement can even happen.
// Reused rather than re-created per call, avoiding the "too many
// AudioContexts" ceiling some browsers enforce.
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  if (!sharedContext) {
    try {
      sharedContext = new AudioContextCtor();
    } catch {
      // A browser can refuse construction outright (e.g. a context-count
      // ceiling already hit) — sound is a purely additive layer (AC #3
      // guarantees the visual/haptic feedback never depends on it), so this
      // degrades to silently skipping the sound, never an uncaught throw.
      return null;
    }
  }
  if (sharedContext.state === "suspended") {
    sharedContext.resume().catch(() => {
      // Same reasoning — a rejected resume (e.g. the context is already
      // closed) must not surface as an unhandled promise rejection.
    });
  }
  return sharedContext;
}

// Fixes a reported lag specific to the *first* sound of each drag gesture
// (2026-09-02, user feedback: the drop sound felt laggier than the
// validation chime that follows it): some browsers auto-suspend an idle
// `AudioContext` between gestures, and `getAudioContext()`'s `resume()`
// call is fire-and-forget, never awaited — the drop sound's own
// `source.start(now)` could get scheduled onto a context still mid-resume,
// so it isn't actually audible until that finishes, while the success
// chime (called a few JS ticks later, same call) benefits from the context
// having had that head start and almost certainly already being fully
// running. Calling this at drag *start* — rather than only implicitly at
// drag *end*, when a sound is first needed — gives `resume()` the entire
// drag gesture's duration to complete before the drop sound is scheduled,
// instead of a matter of milliseconds.
export function warmUpAudioContext(): void {
  getAudioContext();
}

export function playWoodClick(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  const { durationSeconds, filterFrequencyHz, filterQ, peakGain } = woodClickEnvelope;
  const sampleCount = Math.floor(ctx.sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFrequencyHz;
  filter.Q.value = filterQ;

  const gainNode = ctx.createGain();
  const now = ctx.currentTime;
  gainNode.gain.setValueAtTime(peakGain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationSeconds);

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  source.start(now);
  source.stop(now + durationSeconds);
}

// A drop sound + this chime starting at the exact same instant, with the
// click's 700Hz sitting right inside the chime's 550-850Hz sweep, gets
// perceptually masked into one blurred sound rather than heard as two
// distinct events — reported by the user as "only the chime plays" for a
// validated drop, even though the click genuinely does fire (2026-09-02).
// Staggering the chime by this much is enough for the ear to parse
// "click… ding" as separate, while still reading as one instantaneous
// gesture confirmation, not a delay.
export const SUCCESS_CHIME_STAGGER_SECONDS = 0.05;

export function playSuccessChime(delaySeconds = 0): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  const { durationSeconds, startFrequencyHz, endFrequencyHz, peakGain } = successChimeEnvelope;
  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";
  const now = ctx.currentTime + delaySeconds;
  oscillator.frequency.setValueAtTime(startFrequencyHz, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequencyHz, now + durationSeconds);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(peakGain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationSeconds);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + durationSeconds);
}

export function playVictorySound(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  const { noteDurationSeconds, frequenciesHz, peakGain } = victorySoundEnvelope;
  const now = ctx.currentTime;
  frequenciesHz.forEach((frequencyHz, index) => {
    const noteStart = now + index * noteDurationSeconds;
    const oscillator = ctx.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequencyHz, noteStart);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(peakGain, noteStart);
    gainNode.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDurationSeconds);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(noteStart);
    oscillator.stop(noteStart + noteDurationSeconds);
  });
}
