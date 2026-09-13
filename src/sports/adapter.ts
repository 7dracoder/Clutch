import type { CourtState } from "@/domain/types";

export interface TrackedObject {
  id: string;
  kind: "player" | "ball" | "official" | "other";
  team?: "offense" | "defense" | "unknown";
  videoPoint: { x: number; y: number };
  fieldPoint?: { x: number; y: number };
  confidence: number;
}

export type HomographyMatrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface SportAdapter {
  id: "basketball" | "soccer";
  fieldDimensions: { width: number; height: number };
  distanceUnit: "feet" | "meters";
  eventLabels: readonly string[];
  acceptsState(state: CourtState): boolean;
}

export function projectPoint(
  point: { x: number; y: number },
  matrix: HomographyMatrix,
) {
  const [h11, h12, h13, h21, h22, h23, h31, h32, h33] = matrix;
  const denominator = h31 * point.x + h32 * point.y + h33;
  if (Math.abs(denominator) < Number.EPSILON) {
    throw new Error("Homography maps point to infinity");
  }
  return {
    x: (h11 * point.x + h12 * point.y + h13) / denominator,
    y: (h21 * point.x + h22 * point.y + h23) / denominator,
  };
}

export const basketballAdapter: SportAdapter = {
  id: "basketball",
  fieldDimensions: { width: 94, height: 50 },
  distanceUnit: "feet",
  eventLabels: [
    "corner_three_attempt",
    "shot_attempt",
    "pass",
    "turnover",
    "rebound",
  ],
  acceptsState: (state) => state.sport === "basketball",
};

export const soccerAdapter: SportAdapter = {
  id: "soccer",
  fieldDimensions: { width: 105, height: 68 },
  distanceUnit: "meters",
  eventLabels: [
    "shot_on_goal",
    "cross",
    "progressive_pass",
    "off_ball_run",
    "turnover",
  ],
  acceptsState: (state) => state.sport === "soccer",
};

export const sportAdapters = {
  basketball: basketballAdapter,
  soccer: soccerAdapter,
} as const;

export const defaultSportAdapter = soccerAdapter;
