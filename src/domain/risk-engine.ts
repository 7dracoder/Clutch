import type {
  EventPrediction,
  BasketballCourtState,
  LiquiditySnapshot,
  PredictionInput,
  RiskAssessment,
  SoccerCourtState,
} from "@/domain/types";

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export function predictBasketballEvent(
  input: BasketballCourtState & {
    playerShootingRate: number;
    offeredDecimalOdds: number;
    stakeCents: number;
  },
  contextConfidenceModifier = 0,
): EventPrediction {
  const isCorner = input.courtZone.toLowerCase().includes("corner");
  const spaceScore = clamp((input.defenderDistanceFeet - 2) / 8);
  const clockPressure =
    input.shotClockSeconds === undefined
      ? 0.5
      : clamp((8 - input.shotClockSeconds) / 8);

  const attemptProbability = clamp(
    0.08 +
      (isCorner ? 0.24 : 0) +
      (input.hasPossession ? 0.24 : 0) +
      spaceScore * 0.18 +
      (input.movementTowardZone ? 0.08 : 0) +
      clockPressure * 0.1,
  );

  const opennessAdjustment = (spaceScore - 0.5) * 0.12;
  const makeProbability = clamp(
    input.playerShootingRate + opennessAdjustment,
    0.05,
    0.8,
  );

  return {
    event: input.likelyAction,
    attemptProbability,
    makeProbability,
    confidence: clamp(input.visualConfidence + contextConfidenceModifier),
    factors: [
      isCorner ? "player is in a corner zone" : "player is outside a corner zone",
      input.hasPossession ? "possession confirmed" : "possession not confirmed",
      `${input.defenderDistanceFeet.toFixed(1)} feet of defender space`,
      input.movementTowardZone
        ? "movement is toward the target zone"
        : "no target-zone movement detected",
    ],
  };
}

export function predictSoccerEvent(
  input: SoccerCourtState & {
    scoringRate: number;
    offeredDecimalOdds: number;
    stakeCents: number;
  },
  contextConfidenceModifier = 0,
): EventPrediction {
  const zone = input.courtZone.toLowerCase();
  const inPenaltyArea = zone.includes("penalty_area");
  const inAttackingThird =
    inPenaltyArea || zone.includes("attacking_third");
  const onWing = zone.includes("wing");
  const action = input.likelyAction;
  const spaceScore = clamp((input.defenderDistanceMeters - 0.75) / 5);
  const distanceToGoal =
    input.distanceToGoalMeters ??
    approximateDistanceFromZone(zone, inPenaltyArea, inAttackingThird);
  // Simple distance-based xG proxy (closer + space → higher; wing discount).
  const distanceScore = clamp(1 - (distanceToGoal - 6) / 28);
  const xgProxy = clamp(
    input.scoringRate * 0.7 +
      distanceScore * 0.16 +
      spaceScore * 0.08 +
      (inPenaltyArea ? 0.05 : 0) -
      (onWing ? 0.035 : 0),
    0.015,
    0.42,
  );

  let attemptProbability: number;
  let makeProbability: number;
  const factors: string[] = [];

  if (action === "shot_on_goal") {
    attemptProbability = clamp(
      0.18 +
        (input.hasPossession ? 0.22 : 0) +
        (inPenaltyArea ? 0.28 : inAttackingThird ? 0.14 : 0) +
        spaceScore * 0.16 +
        (input.movementTowardZone ? 0.1 : 0) +
        distanceScore * 0.12,
    );
    makeProbability = clamp(xgProxy + (spaceScore - 0.45) * 0.04, 0.02, 0.4);
    factors.push(
      inPenaltyArea
        ? "shot threat inside the penalty area"
        : "central shot look from the final third",
      `~${distanceToGoal.toFixed(0)}m to goal (xG-style distance)`,
    );
  } else if (action === "cross") {
    attemptProbability = clamp(
      0.16 +
        (input.hasPossession ? 0.24 : 0) +
        (onWing ? 0.22 : 0.08) +
        (inAttackingThird ? 0.14 : 0) +
        (input.movementTowardZone ? 0.08 : 0) +
        spaceScore * 0.1,
    );
    // Goal conversion after a cross is much lower than a direct shot.
    makeProbability = clamp(xgProxy * 0.35 + 0.02, 0.015, 0.22);
    factors.push(
      onWing
        ? "wide possession favors a cross"
        : "cross threat from an advanced position",
      `delivery distance ~${distanceToGoal.toFixed(0)}m from goal`,
    );
  } else if (action === "progressive_pass") {
    attemptProbability = clamp(
      0.12 +
        (input.hasPossession ? 0.2 : 0) +
        (inAttackingThird ? 0.16 : 0.06) +
        (input.movementTowardZone ? 0.14 : 0) +
        spaceScore * 0.12,
    );
    makeProbability = clamp(xgProxy * 0.22 + 0.01, 0.01, 0.16);
    factors.push(
      inAttackingThird
        ? "progressive pass available in the final third"
        : "build-up pass while advancing",
      `${input.defenderDistanceMeters.toFixed(1)}m to nearest opponent`,
    );
  } else {
    attemptProbability = clamp(
      0.05 +
        (inAttackingThird ? 0.08 : 0.02) +
        (input.movementTowardZone ? 0.1 : 0) +
        spaceScore * 0.06,
    );
    makeProbability = clamp(xgProxy * 0.12, 0.01, 0.1);
    factors.push(
      "off-ball run — shot/goal chance remains low until possession arrives",
      `pitch position ~${distanceToGoal.toFixed(0)}m from goal`,
    );
  }

  if (input.hasPossession) {
    factors.push("possession signal confirmed");
  } else {
    factors.push("possession uncertain — probabilities discounted");
    attemptProbability *= 0.72;
    makeProbability *= 0.85;
  }

  if (input.movementTowardZone) {
    factors.push("movement/ball is progressing toward goal");
  } else if (action === "shot_on_goal" || action === "cross") {
    factors.push("limited goalward movement in the last frame");
  }

  if (input.visualConfidence < 0.55) {
    factors.push(
      "partial / uncalibrated camera view — positions and distances are approximate",
    );
    attemptProbability *= 0.88;
    makeProbability *= 0.9;
  }

  const signalConsistency =
    (input.hasPossession ? 0.04 : -0.03) +
    (inAttackingThird || inPenaltyArea ? 0.03 : -0.02) +
    (action === "shot_on_goal" && distanceToGoal <= 18 ? 0.04 : 0);

  return {
    event: action,
    attemptProbability: clamp(attemptProbability),
    makeProbability: clamp(makeProbability),
    confidence: clamp(
      input.visualConfidence + contextConfidenceModifier + signalConsistency,
    ),
    factors: factors.slice(0, 5),
  };
}

function approximateDistanceFromZone(
  zone: string,
  inPenaltyArea: boolean,
  inAttackingThird: boolean,
) {
  if (inPenaltyArea) return 11;
  if (inAttackingThird && zone.includes("wing")) return 22;
  if (inAttackingThird) return 19;
  if (zone.includes("middle_third")) return 42;
  return 68;
}

export function calculateLiquidity(
  checkingBalanceCents: number,
  pendingOutflowsCents: number,
  payoutReserveCents: number,
): LiquiditySnapshot {
  return {
    checkingBalanceCents,
    pendingOutflowsCents,
    payoutReserveCents,
    safeCashCents:
      checkingBalanceCents - pendingOutflowsCents - payoutReserveCents,
  };
}

export function assessRisk(
  input: PredictionInput,
  liquidity: LiquiditySnapshot,
  contextConfidenceModifier = 0,
  attemptMultiplier = 1,
): RiskAssessment {
  const prediction =
    input.sport === "soccer"
      ? predictSoccerEvent(input, contextConfidenceModifier)
      : predictBasketballEvent(input, contextConfidenceModifier);
  const scaledAttempt = clamp(
    prediction.attemptProbability * attemptMultiplier,
  );
  const scaledMake = prediction.makeProbability;
  const maximumExposureCents = Math.round(
    input.stakeCents * input.offeredDecimalOdds,
  );
  const probabilityWeightedExposureCents = Math.round(
    maximumExposureCents * scaledAttempt * scaledMake,
  );
  const liquidityBufferCents = liquidity.safeCashCents - maximumExposureCents;

  const status =
    liquidityBufferCents < 0
      ? "at_risk"
      : maximumExposureCents > liquidity.safeCashCents * 0.5
        ? "watch"
        : "safe";

  return {
    prediction: {
      ...prediction,
      attemptProbability: scaledAttempt,
      factors:
        attemptMultiplier !== 1
          ? [
              ...prediction.factors.slice(0, 3),
              attemptMultiplier < 1
                ? "news softens attempt likelihood"
                : "news supports attempt likelihood",
            ]
          : prediction.factors,
    },
    liquidity,
    maximumExposureCents,
    probabilityWeightedExposureCents,
    liquidityBufferCents,
    status,
    generatedAt: new Date().toISOString(),
  };
}
