import { describe, expect, it } from "vitest";
import type { TrackingFrame } from "../src/features/live-capture/types";
import {
  basketballZone,
  soccerZone,
  trackingToCourtState,
} from "../src/features/live-capture/tracking-to-court-state";

const frame: TrackingFrame = {
  type: "tracking",
  sessionId: "test",
  sequence: 1,
  timestampMs: 1_000,
  processedAtMs: 1_020,
  frame: { width: 960, height: 540 },
  calibrated: true,
  objects: [
    {
      id: "player_1",
      kind: "player",
      team: "offense",
      videoPoint: { x: 900, y: 100 },
      fieldPoint: { x: 90, y: 5 },
      confidence: 0.9,
      box: [870, 20, 930, 100],
    },
    {
      id: "player_2",
      kind: "player",
      team: "defense",
      videoPoint: { x: 830, y: 130 },
      fieldPoint: { x: 83, y: 8 },
      confidence: 0.85,
      box: [800, 40, 860, 130],
    },
    {
      id: "ball_3",
      kind: "ball",
      team: "unknown",
      videoPoint: { x: 895, y: 92 },
      fieldPoint: { x: 89.5, y: 5.3 },
      confidence: 0.8,
      box: [888, 85, 902, 99],
    },
  ],
};

describe("live tracking court-state conversion", () => {
  it("identifies basketball corner zones", () => {
    expect(basketballZone({ x: 90, y: 5 })).toBe("right_corner");
    expect(basketballZone({ x: 47, y: 25 })).toBe("top");
  });

  it("derives a possession event from calibrated tracks", () => {
    const state = trackingToCourtState(frame, { sport: "basketball" });
    expect(state).not.toBeNull();
    expect(state?.sport).toBe("basketball");
    if (!state || state.sport !== "basketball") return;
    expect(state?.courtZone).toBe("right_corner");
    expect(state?.hasPossession).toBe(true);
    expect(state?.likelyAction).toBe("corner_three_attempt");
    expect(state?.defenderDistanceFeet).toBeCloseTo(7.62, 1);
  });

  it("returns no court state without a tracked player", () => {
    expect(
      trackingToCourtState(
        {
          ...frame,
          objects: frame.objects.filter((object) => object.kind === "ball"),
        },
        { sport: "basketball" },
      ),
    ).toBeNull();
  });

  it("maps calibrated soccer tracking into metric pitch state", () => {
    expect(soccerZone({ x: 92, y: 34 }, "right")).toBe(
      "attacking_penalty_area",
    );
    const soccerFrame: TrackingFrame = {
      ...frame,
      objects: [
        {
          ...frame.objects[0],
          fieldPoint: { x: 92, y: 34 },
        },
        {
          ...frame.objects[1],
          fieldPoint: { x: 86, y: 34 },
        },
        {
          ...frame.objects[2],
          fieldPoint: { x: 91.5, y: 34.2 },
        },
      ],
    };
    const state = trackingToCourtState(soccerFrame, { sport: "soccer" });
    expect(state?.sport).toBe("soccer");
    if (!state || state.sport !== "soccer") return;
    expect(state.courtZone).toBe("attacking_penalty_area");
    expect(state.defenderDistanceMeters).toBeCloseTo(6, 1);
    expect(state.distanceToGoalMeters).toBeCloseTo(13.5, 0);
    expect(state.likelyAction).toBe("shot_on_goal");
    expect(state.visualConfidence).toBeGreaterThan(0.7);
  });

  it("uses hysteresis to retain soccer possession through small ball drift", () => {
    const previous: TrackingFrame = {
      ...frame,
      sport: "soccer",
      objects: [
        { ...frame.objects[0], fieldPoint: { x: 80, y: 30 } },
        { ...frame.objects[1], fieldPoint: { x: 74, y: 30 } },
        { ...frame.objects[2], fieldPoint: { x: 81, y: 30 } },
      ],
    };
    const current: TrackingFrame = {
      ...previous,
      sequence: 2,
      timestampMs: 1_125,
      objects: [
        { ...previous.objects[0], fieldPoint: { x: 82, y: 30 } },
        previous.objects[1],
        { ...previous.objects[2], fieldPoint: { x: 85, y: 30 } },
      ],
    };
    const state = trackingToCourtState(current, {
      sport: "soccer",
      previous,
    });
    expect(state?.hasPossession).toBe(true);
  });

  it("keeps shot threat when the ball is in the box even if the carrier is slightly outside", () => {
    const soccerFrame: TrackingFrame = {
      ...frame,
      sport: "soccer",
      objects: [
        {
          ...frame.objects[0],
          fieldPoint: { x: 87.2, y: 34 },
        },
        {
          ...frame.objects[1],
          fieldPoint: { x: 80, y: 34 },
        },
        {
          ...frame.objects[2],
          fieldPoint: { x: 89.4, y: 34 },
        },
      ],
    };
    const state = trackingToCourtState(soccerFrame, { sport: "soccer" });
    expect(state?.sport).toBe("soccer");
    if (!state || state.sport !== "soccer") return;
    expect(state.courtZone).toBe("attacking_penalty_area");
    expect(state.hasPossession).toBe(true);
    expect(state.likelyAction).toBe("shot_on_goal");
  });

  it("retains possession briefly when the ball track drops", () => {
    const previous: TrackingFrame = {
      ...frame,
      sport: "soccer",
      objects: [
        { ...frame.objects[0], fieldPoint: { x: 92, y: 34 } },
        { ...frame.objects[1], fieldPoint: { x: 86, y: 34 } },
        { ...frame.objects[2], fieldPoint: { x: 91.5, y: 34.2 } },
      ],
    };
    const current: TrackingFrame = {
      ...previous,
      sequence: 2,
      timestampMs: 1_125,
      objects: [
        { ...previous.objects[0], fieldPoint: { x: 92.2, y: 34 } },
        previous.objects[1],
      ],
    };
    const state = trackingToCourtState(current, {
      sport: "soccer",
      previous,
    });
    expect(state?.hasPossession).toBe(true);
    expect(state?.likelyAction).toBe("shot_on_goal");
  });

  it("caps confidence when the pitch is uncalibrated", () => {
    const uncalibrated: TrackingFrame = {
      ...frame,
      sport: "soccer",
      calibrated: false,
      objects: [
        { ...frame.objects[0], fieldPoint: { x: 92, y: 34 } },
        { ...frame.objects[1], fieldPoint: { x: 86, y: 34 } },
        { ...frame.objects[2], fieldPoint: { x: 91.5, y: 34.2 } },
      ],
    };
    const state = trackingToCourtState(uncalibrated, { sport: "soccer" });
    expect(state?.visualConfidence).toBeLessThanOrEqual(0.52);
  });
});
