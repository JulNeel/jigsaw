import { describe, expect, it } from "vitest";
import { shouldFireFrameComplete } from "./frame-completion-events";

describe("shouldFireFrameComplete", () => {
  it("fires when the last piece brings the count up to the total", () => {
    expect(
      shouldFireFrameComplete({
        confirmedPlacedCountAfterIncrement: 10,
        totalPieceCount: 10,
        alreadyCompleteAtMount: false,
        hasFiredCompletion: false,
      }),
    ).toBe(true);
  });

  it("does not fire while pieces remain", () => {
    expect(
      shouldFireFrameComplete({
        confirmedPlacedCountAfterIncrement: 9,
        totalPieceCount: 10,
        alreadyCompleteAtMount: false,
        hasFiredCompletion: false,
      }),
    ).toBe(false);
  });

  it("never replays for a Participant who joined an already-complete Room", () => {
    expect(
      shouldFireFrameComplete({
        confirmedPlacedCountAfterIncrement: 10,
        totalPieceCount: 10,
        alreadyCompleteAtMount: true,
        hasFiredCompletion: false,
      }),
    ).toBe(false);
  });

  it("never fires twice in the same session, even if more confirmations arrive", () => {
    expect(
      shouldFireFrameComplete({
        confirmedPlacedCountAfterIncrement: 10,
        totalPieceCount: 10,
        alreadyCompleteAtMount: false,
        hasFiredCompletion: true,
      }),
    ).toBe(false);
  });

  it("fires exactly once across a burst of confirmations crossing the threshold together", () => {
    let hasFiredCompletion = false;
    const results = [8, 9, 10, 10].map((confirmedPlacedCountAfterIncrement) => {
      const fires = shouldFireFrameComplete({
        confirmedPlacedCountAfterIncrement,
        totalPieceCount: 10,
        alreadyCompleteAtMount: false,
        hasFiredCompletion,
      });
      if (fires) hasFiredCompletion = true;
      return fires;
    });
    expect(results).toEqual([false, false, true, false]);
  });
});
