import { describe, expect, it } from "vitest";
import { isPredictedFusionConfirmed } from "./predicted-fusion-events";

describe("isPredictedFusionConfirmed", () => {
  it("confirms once every member shares one real, loaded Cluster", () => {
    expect(
      isPredictedFusionConfirmed({
        memberStates: [
          { clusterId: "c1", placedRow: null },
          { clusterId: "c1", placedRow: null },
        ],
        loadedClusterIds: new Set(["c1"]),
      }),
    ).toBe(true);
  });

  it("keeps waiting while the members' real Cluster rows disagree", () => {
    expect(
      isPredictedFusionConfirmed({
        memberStates: [
          { clusterId: "c1", placedRow: null },
          { clusterId: "c2", placedRow: null },
        ],
        loadedClusterIds: new Set(["c1", "c2"]),
      }),
    ).toBe(false);
  });

  it("keeps waiting while the agreed Cluster row itself hasn't arrived yet", () => {
    expect(
      isPredictedFusionConfirmed({
        memberStates: [
          { clusterId: "c1", placedRow: null },
          { clusterId: "c1", placedRow: null },
        ],
        loadedClusterIds: new Set(),
      }),
    ).toBe(false);
  });

  // The bug this predicate exists to close (2026-09-18, user report: "certaines
  // pièces, lors d'une tentative de déplacement, reviennent systématiquement à
  // leur place initiale"). Since Story 3.19 a drop has *three* server outcomes,
  // not two: fused, rejected, or **placed** by contagion — and placement sets
  // `cluster_id = null` on every member. The old "one shared non-null cluster
  // id" test could therefore never become true for a placed group, so the
  // prediction stayed active for the rest of the session, kept rendering those
  // now-locked pieces inside a synthetic draggable Îlot, and every drag came
  // back ALREADY_PLACED — the piece snapping home each time until a reload.
  it("confirms when the drop resolved as a placement, not a fusion", () => {
    expect(
      isPredictedFusionConfirmed({
        memberStates: [
          { clusterId: null, placedRow: 2 },
          { clusterId: null, placedRow: 3 },
        ],
        loadedClusterIds: new Set(),
      }),
    ).toBe(true);
  });

  it("keeps waiting while only part of the group has been placed", () => {
    expect(
      isPredictedFusionConfirmed({
        memberStates: [
          { clusterId: null, placedRow: 2 },
          { clusterId: null, placedRow: null },
        ],
        loadedClusterIds: new Set(),
      }),
    ).toBe(false);
  });

  it("keeps waiting for a member whose row hasn't synced yet", () => {
    expect(
      isPredictedFusionConfirmed({
        memberStates: [{ clusterId: null, placedRow: 2 }, undefined],
        loadedClusterIds: new Set(),
      }),
    ).toBe(false);
  });

  it("never confirms an empty prediction", () => {
    expect(
      isPredictedFusionConfirmed({ memberStates: [], loadedClusterIds: new Set() }),
    ).toBe(false);
  });
});
