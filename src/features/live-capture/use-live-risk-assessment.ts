"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { NewsPredictionModifiers } from "@/domain/news-modifiers";
import {
  riskAssessmentSchema,
  type CourtState,
  type RiskAssessment,
} from "@/domain/types";
import {
  trackingToCourtState,
  type TrackingContext,
} from "@/features/live-capture/tracking-to-court-state";
import type { TrackingFrame } from "@/features/live-capture/types";

const liveRiskResponseSchema = z
  .object({
    risk: riskAssessmentSchema,
    analysisWarning: z.string().optional(),
    contextWarning: z.string().optional(),
  })
  .passthrough();

export interface LiveRiskOptions {
  tracking: TrackingFrame | null;
  takeKeyFrame: () => string | null;
  enabled?: boolean;
  allowExternalKeyFrames?: boolean;
  teamAssignments?: TrackingContext["teamAssignments"];
  sport?: NonNullable<TrackingContext["sport"]>;
  playerShootingRate?: number;
  scoringRate?: number;
  offeredDecimalOdds?: number;
  stakeCents?: number;
  payoutReserveCents?: number;
  newsModifiers?: NewsPredictionModifiers | null;
  player?: { name: string; team: string } | null;
}

function smoothRisk(
  previous: RiskAssessment | null,
  next: RiskAssessment,
  alpha = 0.45,
): RiskAssessment {
  if (!previous) return next;
  const blend = (a: number, b: number) => a * (1 - alpha) + b * alpha;
  return {
    ...next,
    prediction: {
      ...next.prediction,
      attemptProbability: blend(
        previous.prediction.attemptProbability,
        next.prediction.attemptProbability,
      ),
      makeProbability: blend(
        previous.prediction.makeProbability,
        next.prediction.makeProbability,
      ),
      confidence: blend(
        previous.prediction.confidence,
        next.prediction.confidence,
      ),
    },
    probabilityWeightedExposureCents: Math.round(
      blend(
        previous.probabilityWeightedExposureCents,
        next.probabilityWeightedExposureCents,
      ),
    ),
  };
}

export function useLiveRiskAssessment({
  tracking,
  takeKeyFrame,
  enabled = true,
  allowExternalKeyFrames = false,
  teamAssignments,
  sport = "soccer",
  playerShootingRate = 0.38,
  scoringRate = 0.11,
  offeredDecimalOdds = 4,
  stakeCents = 300_000,
  payoutReserveCents = 500_000,
  newsModifiers = null,
  player = null,
}: LiveRiskOptions) {
  const previousTrackingRef = useRef<TrackingFrame | null>(null);
  const lastSignatureRef = useRef("");
  const lastRequestAtRef = useRef(0);
  const lastKeyFrameAtRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const [courtState, setCourtState] = useState<CourtState | null>(null);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [isAssessing, setIsAssessing] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !tracking) return;

    const nextCourtState = trackingToCourtState(tracking, {
      sport,
      previous: previousTrackingRef.current,
      teamAssignments,
    });
    previousTrackingRef.current = tracking;
    if (!nextCourtState) return;
    setCourtState(nextCourtState);

    const signature = [
      nextCourtState.courtZone,
      nextCourtState.hasPossession,
      Math.round(
        nextCourtState.sport === "soccer"
          ? nextCourtState.defenderDistanceMeters
          : nextCourtState.defenderDistanceFeet,
      ),
      nextCourtState.movementTowardZone,
      nextCourtState.likelyAction,
      newsModifiers
        ? `${newsModifiers.scoringRateMultiplier.toFixed(2)}:${newsModifiers.confidenceModifier.toFixed(2)}`
        : "none",
      player?.name ?? "",
    ].join(":");
    const now = Date.now();
    if (
      signature === lastSignatureRef.current ||
      now - lastRequestAtRef.current < 1_000
    ) {
      return;
    }
    lastSignatureRef.current = signature;
    lastRequestAtRef.current = now;

    const shouldSendKeyFrame =
      allowExternalKeyFrames &&
      nextCourtState.hasPossession &&
      (nextCourtState.sport === "soccer"
        ? nextCourtState.courtZone.includes("penalty_area") ||
          nextCourtState.likelyAction === "shot_on_goal" ||
          nextCourtState.likelyAction === "cross"
        : nextCourtState.courtZone.includes("corner")) &&
      now - lastKeyFrameAtRef.current >= 5_000;
    const keyFrameDataUrl = shouldSendKeyFrame ? takeKeyFrame() : null;
    if (keyFrameDataUrl) lastKeyFrameAtRef.current = now;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsAssessing(true);
    setError(null);
    void fetch("/api/risk-assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sport,
        courtState: nextCourtState,
        keyFrameDataUrl: keyFrameDataUrl ?? undefined,
        ...(sport === "soccer" ? { scoringRate } : { playerShootingRate }),
        offeredDecimalOdds,
        stakeCents,
        payoutReserveCents,
        ...(newsModifiers ? { newsModifiers } : {}),
        ...(player ? { player } : {}),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : `Risk request failed with status ${response.status}`;
          throw new Error(message);
        }
        return liveRiskResponseSchema.parse(payload);
      })
      .then((result) => {
        setRisk((previous) => smoothRisk(previous, result.risk));
        setWarning(result.analysisWarning ?? result.contextWarning ?? null);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(
          cause instanceof Error ? cause.message : "Live risk assessment failed",
        );
      })
      .finally(() => {
        if (controllerRef.current === controller) setIsAssessing(false);
      });
  }, [
    allowExternalKeyFrames,
    enabled,
    newsModifiers,
    offeredDecimalOdds,
    payoutReserveCents,
    player,
    playerShootingRate,
    scoringRate,
    sport,
    stakeCents,
    takeKeyFrame,
    teamAssignments,
    tracking,
  ]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return { courtState, risk, isAssessing, warning, error };
}
