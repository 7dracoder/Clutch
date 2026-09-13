import { z } from "zod";
import { assessRisk } from "@/domain/risk-engine";
import {
  deriveNewsPredictionModifiers,
  mergeNewsModifiers,
  type NewsPredictionModifiers,
} from "@/domain/news-modifiers";
import {
  courtStateSchema,
  predictionInputSchema,
  type PlayerContext,
} from "@/domain/types";
import { analyzeSportsFrame } from "@/integrations/baseten";
import { createTreasuryBriefing } from "@/integrations/elevenlabs";
import { getRhoLiquidity } from "@/integrations/rho";
import { researchPlayerContext } from "@/integrations/tavily";

const newsModifiersSchema = z.object({
  confidenceModifier: z.number().min(-1).max(1),
  scoringRateMultiplier: z.number().min(0.5).max(1.5),
  attemptMultiplier: z.number().min(0.5).max(1.5),
  notes: z.array(z.string()).default([]),
});

export const assessmentRequestSchema = z
  .object({
    imageUrl: z.string().url().optional(),
    keyFrameDataUrl: z
      .string()
      .max(2_500_000)
      .refine((value) => value.startsWith("data:image/jpeg;base64,"), {
        message: "keyFrameDataUrl must be a JPEG data URL",
      })
      .optional(),
    timestampMs: z.number().int().nonnegative().optional(),
    sport: z.enum(["basketball", "soccer"]).default("soccer"),
    courtState: courtStateSchema.optional(),
    playerShootingRate: z.number().min(0).max(1).optional(),
    scoringRate: z.number().min(0).max(1).optional(),
    offeredDecimalOdds: z.number().gt(1),
    stakeCents: z.number().int().positive(),
    payoutReserveCents: z.number().int().nonnegative(),
    player: z
      .object({
        name: z.string().min(1),
        team: z.string().min(1),
      })
      .optional(),
    /** Precomputed from Watch Slate / EventIntel so live frames don't hit Tavily. */
    newsModifiers: newsModifiersSchema.optional(),
    matchEvidence: z.string().max(8_000).optional(),
  })
  .refine((value) => value.courtState || value.imageUrl, {
    message: "Provide either courtState or imageUrl",
  })
  .refine((value) => !value.imageUrl || value.timestampMs !== undefined, {
    message: "timestampMs is required with imageUrl",
  });

export type AssessmentRequest = z.infer<typeof assessmentRequestSchema>;

function asModifiers(
  value: z.infer<typeof newsModifiersSchema> | undefined,
): NewsPredictionModifiers | null {
  return value ?? null;
}

export async function assessTreasuryRisk(request: AssessmentRequest) {
  const sport = request.courtState?.sport ?? request.sport;
  let courtState =
    request.courtState ??
    (await analyzeSportsFrame({
      imageUrl: request.imageUrl!,
      timestampMs: request.timestampMs!,
      sport,
    }));
  let analysisWarning: string | undefined;
  if (
    request.courtState &&
    request.keyFrameDataUrl &&
    process.env.BASETEN_API_KEY
  ) {
    try {
      const semanticState = await analyzeSportsFrame({
        imageUrl: request.keyFrameDataUrl,
        timestampMs: request.courtState.timestampMs,
        sport,
      });
      if (semanticState.sport === request.courtState.sport) {
        courtState = {
          ...request.courtState,
          ...semanticState,
          visualConfidence:
            request.courtState.visualConfidence * 0.4 +
            semanticState.visualConfidence * 0.6,
        };
      }
    } catch (error) {
      analysisWarning =
        error instanceof Error ? error.message : "Key-frame analysis failed";
    }
  }

  let playerContext: PlayerContext | undefined;
  let contextWarning: string | undefined;
  if (request.player) {
    try {
      playerContext = await researchPlayerContext({
        playerName: request.player.name,
        team: request.player.team,
      });
    } catch (error) {
      contextWarning =
        error instanceof Error ? error.message : "Player research failed";
    }
  }

  const matchModifiers =
    asModifiers(request.newsModifiers) ??
    deriveNewsPredictionModifiers(request.matchEvidence);
  const playerModifiers: NewsPredictionModifiers | null = playerContext
    ? {
        confidenceModifier: playerContext.confidenceModifier,
        scoringRateMultiplier: playerContext.scoringRateMultiplier ?? 1,
        attemptMultiplier: playerContext.attemptMultiplier ?? 1,
        notes: playerContext.notes ?? [],
      }
    : null;
  const news = mergeNewsModifiers(
    ...(matchModifiers ? [matchModifiers] : []),
    ...(playerModifiers ? [playerModifiers] : []),
  );

  const baseScoringRate = request.scoringRate ?? 0.11;
  const baseShootingRate = request.playerShootingRate ?? 0.38;
  const predictionInput = predictionInputSchema.parse({
    ...courtState,
    ...(courtState.sport === "soccer"
      ? {
          scoringRate: Math.min(
            0.45,
            Math.max(0.03, baseScoringRate * news.scoringRateMultiplier),
          ),
        }
      : {
          playerShootingRate: Math.min(
            0.7,
            Math.max(0.08, baseShootingRate * news.scoringRateMultiplier),
          ),
        }),
    offeredDecimalOdds: request.offeredDecimalOdds,
    stakeCents: request.stakeCents,
  });
  const rho = await getRhoLiquidity(request.payoutReserveCents);
  const risk = assessRisk(
    predictionInput,
    rho.liquidity,
    news.confidenceModifier,
    news.attemptMultiplier,
  );

  if (news.notes.length) {
    risk.prediction.factors = [
      ...risk.prediction.factors.slice(0, 3),
      ...news.notes.slice(0, 1),
    ];
  }

  return {
    risk,
    courtState,
    playerContext,
    newsModifiers: news,
    contextWarning,
    analysisWarning,
    treasuryBriefing: createTreasuryBriefing(risk, playerContext, courtState),
    ledger: {
      accounts: rho.accounts,
      pendingTransactions: rho.pendingTransactions,
    },
  };
}
