import { describe, expect, it } from "vitest";
import {
  assessRisk,
  calculateLiquidity,
  predictBasketballEvent,
  predictSoccerEvent,
} from "../src/domain/risk-engine";

const input = {
  sport: "basketball" as const,
  timestampMs: 4_100,
  courtZone: "right_corner",
  hasPossession: true,
  defenderDistanceFeet: 7.4,
  movementTowardZone: false,
  shotClockSeconds: 6.7,
  likelyAction: "corner_three_attempt",
  visualConfidence: 0.78,
  playerShootingRate: 0.38,
  offeredDecimalOdds: 4,
  stakeCents: 300_000,
};

describe("risk engine", () => {
  it("raises attempt probability for an open corner possession", () => {
    const prediction = predictBasketballEvent(input);
    expect(prediction.attemptProbability).toBeGreaterThan(0.6);
    expect(prediction.makeProbability).toBeGreaterThan(
      input.playerShootingRate,
    );
  });

  it("subtracts pending outflows and reserves from checking cash", () => {
    expect(calculateLiquidity(2_000_000, 250_000, 500_000).safeCashCents).toBe(
      1_250_000,
    );
  });

  it("marks maximum exposure above safe cash as at risk", () => {
    const liquidity = calculateLiquidity(1_500_000, 100_000, 300_000);
    const assessment = assessRisk(input, liquidity);
    expect(assessment.maximumExposureCents).toBe(1_200_000);
    expect(assessment.liquidityBufferCents).toBe(-100_000);
    expect(assessment.status).toBe("at_risk");
  });

  it("raises shot probability for open possession in the penalty area", () => {
    const prediction = predictSoccerEvent({
      sport: "soccer",
      timestampMs: 4_200,
      courtZone: "attacking_penalty_area",
      hasPossession: true,
      defenderDistanceMeters: 5.4,
      distanceToGoalMeters: 12,
      attackingDirection: "right",
      teamInPossession: "offense",
      movementTowardZone: true,
      likelyAction: "shot_on_goal",
      visualConfidence: 0.9,
      scoringRate: 0.11,
      offeredDecimalOdds: 5.5,
      stakeCents: 300_000,
    });
    expect(prediction.event).toBe("shot_on_goal");
    expect(prediction.attemptProbability).toBeGreaterThan(0.6);
    expect(prediction.makeProbability).toBeGreaterThan(0.11);
    expect(prediction.makeProbability).toBeLessThan(0.45);
  });

  it("keeps cross goal conversion lower than a direct shot", () => {
    const cross = predictSoccerEvent({
      sport: "soccer",
      timestampMs: 2_300,
      courtZone: "attacking_third_top_wing",
      hasPossession: true,
      defenderDistanceMeters: 4.7,
      distanceToGoalMeters: 22,
      attackingDirection: "right",
      teamInPossession: "offense",
      movementTowardZone: true,
      likelyAction: "cross",
      visualConfidence: 0.86,
      scoringRate: 0.11,
      offeredDecimalOdds: 5.5,
      stakeCents: 300_000,
    });
    const shot = predictSoccerEvent({
      sport: "soccer",
      timestampMs: 4_200,
      courtZone: "attacking_penalty_area",
      hasPossession: true,
      defenderDistanceMeters: 5.4,
      distanceToGoalMeters: 12,
      attackingDirection: "right",
      teamInPossession: "offense",
      movementTowardZone: true,
      likelyAction: "shot_on_goal",
      visualConfidence: 0.9,
      scoringRate: 0.11,
      offeredDecimalOdds: 5.5,
      stakeCents: 300_000,
    });
    expect(cross.attemptProbability).toBeGreaterThan(0.45);
    expect(cross.makeProbability).toBeLessThan(shot.makeProbability);
  });

  it("discounts off-ball runs versus on-ball shot threats", () => {
    const offBall = predictSoccerEvent({
      sport: "soccer",
      timestampMs: 900,
      courtZone: "middle_third_center",
      hasPossession: false,
      defenderDistanceMeters: 3,
      distanceToGoalMeters: 48,
      attackingDirection: "right",
      teamInPossession: "unknown",
      movementTowardZone: false,
      likelyAction: "off_ball_run",
      visualConfidence: 0.7,
      scoringRate: 0.11,
      offeredDecimalOdds: 5.5,
      stakeCents: 300_000,
    });
    expect(offBall.attemptProbability).toBeLessThan(0.2);
    expect(offBall.makeProbability).toBeLessThan(0.08);
  });
});
