import type { CourtState } from "@/domain/types";

export type DemoFrame = CourtState & {
  playerPositions: Array<{
    id: string;
    team: "offense" | "defense";
    x: number;
    y: number;
  }>;
  ballHandlerId?: string;
};

export const basketballDemoTimeline: DemoFrame[] = [
  {
    sport: "basketball",
    timestampMs: 0,
    courtZone: "right_wing",
    hasPossession: false,
    defenderDistanceFeet: 3.2,
    movementTowardZone: true,
    shotClockSeconds: 10.8,
    likelyAction: "off_ball_cut",
    visualConfidence: 0.82,
    ballHandlerId: "offense_1",
    playerPositions: [
      { id: "offense_1", team: "offense", x: 62, y: 48 },
      { id: "offense_2", team: "offense", x: 78, y: 32 },
      { id: "offense_3", team: "offense", x: 48, y: 74 },
      { id: "defense_1", team: "defense", x: 59, y: 49 },
      { id: "defense_2", team: "defense", x: 75, y: 34 },
    ],
  },
  {
    sport: "basketball",
    timestampMs: 2200,
    courtZone: "right_corner",
    hasPossession: false,
    defenderDistanceFeet: 5.8,
    movementTowardZone: true,
    shotClockSeconds: 8.6,
    likelyAction: "corner_catch",
    visualConfidence: 0.86,
    ballHandlerId: "offense_1",
    playerPositions: [
      { id: "offense_1", team: "offense", x: 65, y: 50 },
      { id: "offense_2", team: "offense", x: 91, y: 18 },
      { id: "offense_3", team: "offense", x: 50, y: 72 },
      { id: "defense_1", team: "defense", x: 62, y: 51 },
      { id: "defense_2", team: "defense", x: 82, y: 27 },
    ],
  },
  {
    sport: "basketball",
    timestampMs: 4100,
    courtZone: "right_corner",
    hasPossession: true,
    defenderDistanceFeet: 7.4,
    movementTowardZone: false,
    shotClockSeconds: 6.7,
    likelyAction: "corner_three_attempt",
    visualConfidence: 0.9,
    ballHandlerId: "offense_2",
    playerPositions: [
      { id: "offense_1", team: "offense", x: 68, y: 51 },
      { id: "offense_2", team: "offense", x: 93, y: 16 },
      { id: "offense_3", team: "offense", x: 52, y: 70 },
      { id: "defense_1", team: "defense", x: 64, y: 52 },
      { id: "defense_2", team: "defense", x: 84, y: 25 },
    ],
  },
];
