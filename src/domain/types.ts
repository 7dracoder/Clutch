import { z } from "zod";

const sharedFieldState = {
  timestampMs: z.number().int().nonnegative(),
  courtZone: z.string(),
  hasPossession: z.boolean(),
  movementTowardZone: z.boolean().default(false),
  likelyAction: z.string(),
  visualConfidence: z.number().min(0).max(1),
};

export const basketballCourtStateSchema = z.object({
  sport: z.literal("basketball").default("basketball"),
  ...sharedFieldState,
  defenderDistanceFeet: z.number().nonnegative(),
  shotClockSeconds: z.number().nonnegative().optional(),
});

export const soccerCourtStateSchema = z.object({
  sport: z.literal("soccer"),
  ...sharedFieldState,
  defenderDistanceMeters: z.number().nonnegative(),
  attackingDirection: z.enum(["left", "right"]).default("right"),
  teamInPossession: z.enum(["offense", "defense", "unknown"]).default("unknown"),
  /** Approximate meters from ball/handler to the center of the attacking goal. */
  distanceToGoalMeters: z.number().nonnegative().optional(),
  matchClockSeconds: z.number().nonnegative().optional(),
});

export const courtStateSchema = z.discriminatedUnion("sport", [
  basketballCourtStateSchema,
  soccerCourtStateSchema,
]);

export type BasketballCourtState = z.infer<typeof basketballCourtStateSchema>;
export type SoccerCourtState = z.infer<typeof soccerCourtStateSchema>;
export type CourtState = z.infer<typeof courtStateSchema>;

const sharedPredictionInput = {
  offeredDecimalOdds: z.number().gt(1),
  stakeCents: z.number().int().positive(),
};

export const basketballPredictionInputSchema =
  basketballCourtStateSchema.extend({
    ...sharedPredictionInput,
    playerShootingRate: z.number().min(0).max(1),
  });

export const soccerPredictionInputSchema = soccerCourtStateSchema.extend({
  ...sharedPredictionInput,
  scoringRate: z.number().min(0).max(1),
});

export const predictionInputSchema = z.discriminatedUnion("sport", [
  basketballPredictionInputSchema,
  soccerPredictionInputSchema,
]);

export type PredictionInput = z.infer<typeof predictionInputSchema>;

export const eventPredictionSchema = z.object({
  event: z.string(),
  attemptProbability: z.number().min(0).max(1),
  makeProbability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  factors: z.array(z.string()),
});

export const liquiditySnapshotSchema = z.object({
  checkingBalanceCents: z.number().int(),
  pendingOutflowsCents: z.number().int().nonnegative(),
  payoutReserveCents: z.number().int().nonnegative(),
  safeCashCents: z.number().int(),
});

export const riskAssessmentSchema = z.object({
  prediction: eventPredictionSchema,
  liquidity: liquiditySnapshotSchema,
  maximumExposureCents: z.number().int().nonnegative(),
  probabilityWeightedExposureCents: z.number().int().nonnegative(),
  liquidityBufferCents: z.number().int(),
  status: z.enum(["safe", "watch", "at_risk"]),
  generatedAt: z.string(),
});

export const researchSourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  summary: z.string(),
  score: z.number().optional(),
});

export const playerContextSchema = z.object({
  query: z.string(),
  confidenceModifier: z.number().min(-1).max(1),
  scoringRateMultiplier: z.number().min(0.5).max(1.5).default(1),
  attemptMultiplier: z.number().min(0.5).max(1.5).default(1),
  summary: z.string(),
  sources: z.array(researchSourceSchema),
  notes: z.array(z.string()).default([]),
});

export type EventPrediction = z.infer<typeof eventPredictionSchema>;
export type LiquiditySnapshot = z.infer<typeof liquiditySnapshotSchema>;
export type RiskStatus = z.infer<typeof riskAssessmentSchema>["status"];
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type PlayerContext = z.infer<typeof playerContextSchema>;
