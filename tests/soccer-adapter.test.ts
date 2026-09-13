import { describe, expect, it } from "vitest";
import {
  courtStateSchema,
  predictionInputSchema,
} from "../src/domain/types";
import { assessmentRequestSchema } from "../src/application/assess-treasury-risk";
import { soccerDemoTimeline } from "../src/data/soccer-demo";
import { projectPoint, soccerAdapter } from "../src/sports/adapter";

describe("soccer adapter contracts", () => {
  it("uses a 105 by 68 meter pitch", () => {
    expect(soccerAdapter.fieldDimensions).toEqual({ width: 105, height: 68 });
    expect(soccerAdapter.distanceUnit).toBe("meters");
    expect(
      projectPoint(
        { x: 50, y: 50 },
        [1.05, 0, 0, 0, 0.68, 0, 0, 0, 1],
      ),
    ).toEqual({ x: 52.5, y: 34 });
  });

  it("validates the deterministic soccer timeline", () => {
    expect(soccerDemoTimeline).toHaveLength(3);
    for (const frame of soccerDemoTimeline) {
      expect(courtStateSchema.parse(frame).sport).toBe("soccer");
    }
    expect(soccerDemoTimeline.at(-1)?.likelyAction).toBe("shot_on_goal");
  });

  it("requires soccer scoring rate and metric distance", () => {
    const frame = soccerDemoTimeline.at(-1)!;
    const parsed = predictionInputSchema.parse({
      ...frame,
      scoringRate: 0.11,
      offeredDecimalOdds: 5.5,
      stakeCents: 300_000,
    });
    expect(parsed.sport).toBe("soccer");
    expect("defenderDistanceMeters" in parsed).toBe(true);
  });

  it("accepts a soccer state through the treasury assessment API schema", () => {
    const parsed = assessmentRequestSchema.parse({
      sport: "soccer",
      courtState: soccerDemoTimeline.at(-1),
      scoringRate: 0.11,
      offeredDecimalOdds: 5.5,
      stakeCents: 300_000,
      payoutReserveCents: 500_000,
    });
    expect(parsed.courtState?.sport).toBe("soccer");
  });
});
