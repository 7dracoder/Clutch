import type { SoccerCourtState } from "@/domain/types";

export type SoccerDemoFrame = SoccerCourtState & {
  playerPositions: Array<{
    id: string;
    role: "player" | "goalkeeper" | "referee";
    team: "offense" | "defense" | "unknown";
    x: number;
    y: number;
  }>;
  ball: { x: number; y: number };
  ballHandlerId?: string;
};

export const soccerDemoTimeline: SoccerDemoFrame[] = [
  {
    sport: "soccer",
    timestampMs: 0,
    courtZone: "middle_third_top_wing",
    hasPossession: true,
    defenderDistanceMeters: 3.1,
    attackingDirection: "right",
    teamInPossession: "offense",
    movementTowardZone: true,
    likelyAction: "progressive_pass",
    visualConfidence: 0.79,
    distanceToGoalMeters: 51,
    ballHandlerId: "player_7",
    ball: { x: 59, y: 12 },
    playerPositions: [
      { id: "player_7", role: "player", team: "offense", x: 59, y: 12 },
      { id: "player_9", role: "player", team: "offense", x: 77, y: 31 },
      { id: "player_11", role: "player", team: "offense", x: 72, y: 56 },
      { id: "player_4", role: "player", team: "defense", x: 64, y: 16 },
      { id: "player_5", role: "player", team: "defense", x: 80, y: 34 },
      { id: "keeper_1", role: "goalkeeper", team: "defense", x: 101, y: 34 },
      { id: "referee_1", role: "referee", team: "unknown", x: 54, y: 38 },
    ],
  },
  {
    sport: "soccer",
    timestampMs: 2300,
    courtZone: "attacking_third_top_wing",
    hasPossession: true,
    defenderDistanceMeters: 4.7,
    attackingDirection: "right",
    teamInPossession: "offense",
    movementTowardZone: true,
    likelyAction: "cross",
    visualConfidence: 0.86,
    distanceToGoalMeters: 36,
    ballHandlerId: "player_7",
    ball: { x: 79, y: 9 },
    playerPositions: [
      { id: "player_7", role: "player", team: "offense", x: 79, y: 9 },
      { id: "player_9", role: "player", team: "offense", x: 87, y: 30 },
      { id: "player_11", role: "player", team: "offense", x: 82, y: 50 },
      { id: "player_4", role: "player", team: "defense", x: 75, y: 15 },
      { id: "player_5", role: "player", team: "defense", x: 85, y: 35 },
      { id: "keeper_1", role: "goalkeeper", team: "defense", x: 101, y: 34 },
      { id: "referee_1", role: "referee", team: "unknown", x: 61, y: 38 },
    ],
  },
  {
    sport: "soccer",
    timestampMs: 4200,
    courtZone: "attacking_penalty_area",
    hasPossession: true,
    defenderDistanceMeters: 5.4,
    attackingDirection: "right",
    teamInPossession: "offense",
    movementTowardZone: true,
    likelyAction: "shot_on_goal",
    visualConfidence: 0.9,
    distanceToGoalMeters: 14.3,
    ballHandlerId: "player_9",
    ball: { x: 91, y: 31 },
    playerPositions: [
      { id: "player_7", role: "player", team: "offense", x: 87, y: 10 },
      { id: "player_9", role: "player", team: "offense", x: 91, y: 31 },
      { id: "player_11", role: "player", team: "offense", x: 85, y: 51 },
      { id: "player_4", role: "player", team: "defense", x: 84, y: 20 },
      { id: "player_5", role: "player", team: "defense", x: 86, y: 36 },
      { id: "keeper_1", role: "goalkeeper", team: "defense", x: 101, y: 34 },
      { id: "referee_1", role: "referee", team: "unknown", x: 70, y: 38 },
    ],
  },
];
