import { describe, expect, it } from "vitest";
import {
  SUCCESS_CHIME_STAGGER_SECONDS,
  successChimeEnvelope,
  victorySoundEnvelope,
  woodClickEnvelope,
} from "./play-tone";

describe("woodClickEnvelope", () => {
  it("is short enough to read as a click, not a sustained tone", () => {
    expect(woodClickEnvelope.durationSeconds).toBeGreaterThan(0);
    expect(woodClickEnvelope.durationSeconds).toBeLessThan(0.3);
  });

  it("filters into an audible, knock-like frequency range", () => {
    expect(woodClickEnvelope.filterFrequencyHz).toBeGreaterThan(100);
    expect(woodClickEnvelope.filterFrequencyHz).toBeLessThan(4000);
  });

  it("has a positive, resonant but not runaway Q", () => {
    expect(woodClickEnvelope.filterQ).toBeGreaterThan(0);
    expect(woodClickEnvelope.filterQ).toBeLessThan(10);
  });

  it("peaks below full gain, to avoid clipping", () => {
    expect(woodClickEnvelope.peakGain).toBeGreaterThan(0);
    expect(woodClickEnvelope.peakGain).toBeLessThanOrEqual(1);
  });
});

describe("successChimeEnvelope", () => {
  it("is short enough to read as a chime, not a sustained tone", () => {
    expect(successChimeEnvelope.durationSeconds).toBeGreaterThan(0);
    expect(successChimeEnvelope.durationSeconds).toBeLessThan(0.3);
  });

  it("rises in pitch (ascending reads as positive, not descending/negative)", () => {
    expect(successChimeEnvelope.endFrequencyHz).toBeGreaterThan(
      successChimeEnvelope.startFrequencyHz,
    );
  });

  it("stays in an audible, bright-but-not-piercing frequency range", () => {
    expect(successChimeEnvelope.startFrequencyHz).toBeGreaterThan(100);
    expect(successChimeEnvelope.endFrequencyHz).toBeLessThan(4000);
  });

  it("peaks below full gain, to avoid clipping", () => {
    expect(successChimeEnvelope.peakGain).toBeGreaterThan(0);
    expect(successChimeEnvelope.peakGain).toBeLessThanOrEqual(1);
  });
});

describe("SUCCESS_CHIME_STAGGER_SECONDS", () => {
  it("is a short but non-zero stagger — enough to avoid masking the drop sound, not a perceptible delay", () => {
    expect(SUCCESS_CHIME_STAGGER_SECONDS).toBeGreaterThan(0);
    expect(SUCCESS_CHIME_STAGGER_SECONDS).toBeLessThan(0.15);
  });
});

describe("victorySoundEnvelope", () => {
  it("is a short per-note duration, so the whole arpeggio still reads as one moment", () => {
    expect(victorySoundEnvelope.noteDurationSeconds).toBeGreaterThan(0);
    expect(victorySoundEnvelope.noteDurationSeconds).toBeLessThan(0.3);
  });

  it("has more than one note (an arpeggio, not a single tone)", () => {
    expect(victorySoundEnvelope.frequenciesHz.length).toBeGreaterThan(1);
  });

  it("ascends in pitch overall (reads as positive, not descending/negative)", () => {
    const { frequenciesHz } = victorySoundEnvelope;
    expect(frequenciesHz.at(-1)).toBeGreaterThan(frequenciesHz[0]);
  });

  it("stays within an audible, non-piercing frequency range", () => {
    for (const frequencyHz of victorySoundEnvelope.frequenciesHz) {
      expect(frequencyHz).toBeGreaterThan(100);
      expect(frequencyHz).toBeLessThan(4000);
    }
  });

  it("peaks below full gain, to avoid clipping (square waves carry more harmonic energy than a sine)", () => {
    expect(victorySoundEnvelope.peakGain).toBeGreaterThan(0);
    expect(victorySoundEnvelope.peakGain).toBeLessThanOrEqual(1);
  });
});
