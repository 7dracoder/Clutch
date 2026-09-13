import type {
  BasketballCourtState,
  CourtState,
  SoccerCourtState,
} from "@/domain/types";
import type { TrackingFrame } from "@/features/live-capture/types";
import { sportAdapters } from "@/sports/adapter";

type Team = "offense" | "defense" | "unknown";
type Sport = keyof typeof sportAdapters;

export interface TrackingContext {
  previous?: TrackingFrame | null;
  teamAssignments?: Record<string, Team>;
  sport?: Sport;
  attackingDirection?: "left" | "right";
}

const distance = (
  first: { x: number; y: number },
  second: { x: number; y: number },
) => Math.hypot(first.x - second.x, first.y - second.y);

function normalizedFieldPoint(
  object: TrackingFrame["objects"][number],
  frame: TrackingFrame["frame"],
  sport: Sport,
) {
  const dimensions = sportAdapters[sport].fieldDimensions;
  return (
    object.fieldPoint ?? {
      x: (object.videoPoint.x / frame.width) * dimensions.width,
      y: (object.videoPoint.y / frame.height) * dimensions.height,
    }
  );
}

export function basketballZone(point: { x: number; y: number }) {
  const nearSideline = point.y <= 8 || point.y >= 42;
  if (point.x >= 80 && nearSideline) return "right_corner";
  if (point.x <= 14 && nearSideline) return "left_corner";
  if (point.x >= 70) return "right_wing";
  if (point.x <= 24) return "left_wing";
  return "top";
}

export function soccerZone(
  point: { x: number; y: number },
  attackingDirection: "left" | "right" = "right",
) {
  const attackingX =
    attackingDirection === "right" ? point.x : 105 - point.x;
  const inPenaltyWidth = point.y >= 13.84 && point.y <= 54.16;
  const wing =
    point.y < 13.6 ? "top_wing" : point.y > 54.4 ? "bottom_wing" : null;
  if (attackingX >= 88.5 && inPenaltyWidth) return "attacking_penalty_area";
  if (attackingX >= 70) {
    return wing ? `attacking_third_${wing}` : "attacking_third_center";
  }
  if (attackingX <= 35) {
    return wing ? `defensive_third_${wing}` : "defensive_third_center";
  }
  return wing ? `middle_third_${wing}` : "middle_third_center";
}

export function trackingToCourtState(
  frame: TrackingFrame,
  context: TrackingContext = {},
): CourtState | null {
  const sport = context.sport ?? frame.sport ?? "soccer";
  return sport === "soccer"
    ? trackingToSoccerState(frame, context)
    : trackingToBasketballState(frame, context);
}

export const trackingToFieldState = trackingToCourtState;

function trackingToSoccerState(
  frame: TrackingFrame,
  context: TrackingContext,
): SoccerCourtState | null {
  const players = frame.objects.filter((object) => object.kind === "player");
  if (players.length === 0) return null;
  const ball = bestBall(frame);
  const ballPoint = ball
    ? normalizedFieldPoint(ball, frame.frame, "soccer")
    : undefined;
  const ballHandler = nearestPlayer(players, ballPoint, frame, "soccer");
  const previousBall = context.previous ? bestBall(context.previous) : undefined;
  const previousBallPoint =
    previousBall && context.previous
      ? normalizedFieldPoint(previousBall, context.previous.frame, "soccer")
      : undefined;
  const previousPlayers = (context.previous?.objects ?? []).filter(
    (object) => object.kind === "player",
  );
  const previousHandler = nearestPlayer(
    previousPlayers,
    previousBallPoint,
    context.previous ?? frame,
    "soccer",
  );
  const heldPreviousPossession = Boolean(
    previousHandler &&
      previousBallPoint &&
      previousHandler.distance <= 2.5,
  );
  // Prefer current ball carrier; if the ball drops for a frame, keep the prior handler.
  const selectedPlayer =
    ballHandler?.player ??
    (heldPreviousPossession ? previousHandler?.player : undefined) ??
    players[0];
  const selectedPoint = normalizedFieldPoint(
    selectedPlayer,
    frame.frame,
    "soccer",
  );
  const selectedTeam = teamFor(selectedPlayer, context);
  const nearestOpponentMeters = nearestOpponentDistance(
    players,
    selectedPlayer,
    selectedPoint,
    selectedTeam,
    frame,
    context,
    "soccer",
    8,
  );
  const previousPlayer = context.previous?.objects.find(
    (object) => object.id === selectedPlayer.id,
  );
  const previousPoint = previousPlayer
    ? normalizedFieldPoint(previousPlayer, context.previous!.frame, "soccer")
    : undefined;
  const attackingDirection =
    context.attackingDirection ??
    (selectedTeam === "defense" ? "left" : "right");
  const directionMultiplier = attackingDirection === "right" ? 1 : -1;
  const movedTowardGoal = Boolean(
    previousPoint &&
      (selectedPoint.x - previousPoint.x) * directionMultiplier > 0.35,
  );
  const ballMovingTowardGoal = Boolean(
    previousBallPoint &&
      ballPoint &&
      (ballPoint.x - previousBallPoint.x) * directionMultiplier > 0.4,
  );
  const referencePoint = ballPoint ?? selectedPoint;
  const distanceToGoalMeters = distanceToAttackingGoal(
    referencePoint,
    attackingDirection,
  );
  const playerZone = soccerZone(selectedPoint, attackingDirection);
  const ballZone = ballPoint
    ? soccerZone(ballPoint, attackingDirection)
    : undefined;
  // Ball owns box/final-third threat labels; carrier owns build-up labels.
  const courtZone = fuseSoccerZone(playerZone, ballZone);
  const hardPossession = Boolean(
    ballHandler &&
      ballHandler.distance <= (heldPreviousPossession ? 3.3 : 2.5),
  );
  const possessionMemory = Boolean(
    !ball &&
      heldPreviousPossession &&
      previousHandler?.player.id === selectedPlayer.id,
  );
  const hasPossession = hardPossession || possessionMemory;
  const centralLane =
    Math.abs((ballPoint ?? selectedPoint).y - 34) <= 12;
  const likelyAction = inferSoccerAction({
    hasPossession,
    zone: courtZone,
    ballZone,
    playerZone,
    distanceToGoalMeters,
    defenderDistanceMeters: nearestOpponentMeters,
    movedTowardGoal: movedTowardGoal || ballMovingTowardGoal,
    centralLane,
  });

  return {
    sport: "soccer",
    timestampMs: Math.max(0, Math.round(frame.timestampMs)),
    courtZone,
    hasPossession,
    defenderDistanceMeters: Math.max(0, nearestOpponentMeters),
    distanceToGoalMeters,
    movementTowardZone: movedTowardGoal || ballMovingTowardGoal,
    attackingDirection,
    teamInPossession: selectedTeam,
    likelyAction,
    visualConfidence: soccerStateConfidence(
      frame,
      players,
      ball,
      hasPossession,
    ),
  };
}

function fuseSoccerZone(playerZone: string, ballZone?: string) {
  if (!ballZone) return playerZone;
  if (ballZone.includes("penalty_area")) return ballZone;
  if (
    ballZone.includes("attacking_third") &&
    !playerZone.includes("penalty_area")
  ) {
    return ballZone;
  }
  return playerZone;
}

function distanceToAttackingGoal(
  point: { x: number; y: number },
  attackingDirection: "left" | "right",
) {
  const goal = {
    x: attackingDirection === "right" ? 105 : 0,
    y: 34,
  };
  return distance(point, goal);
}

function inferSoccerAction({
  hasPossession,
  zone,
  ballZone,
  playerZone,
  distanceToGoalMeters,
  defenderDistanceMeters,
  movedTowardGoal,
  centralLane,
}: {
  hasPossession: boolean;
  zone: string;
  ballZone?: string;
  playerZone: string;
  distanceToGoalMeters: number;
  defenderDistanceMeters: number;
  movedTowardGoal: boolean;
  centralLane: boolean;
}) {
  const threatZone = ballZone ?? zone;
  const inBox =
    threatZone.includes("penalty_area") ||
    playerZone.includes("penalty_area");
  const inFinalThird =
    inBox ||
    threatZone.includes("attacking_third") ||
    zone.includes("attacking_third");
  const onWing = threatZone.includes("wing") || zone.includes("wing");
  const openLook = defenderDistanceMeters >= 2.4;

  if (hasPossession && (inBox || (distanceToGoalMeters <= 16 && openLook))) {
    return "shot_on_goal";
  }
  if (
    hasPossession &&
    inFinalThird &&
    centralLane &&
    movedTowardGoal &&
    distanceToGoalMeters <= 24 &&
    openLook
  ) {
    return "shot_on_goal";
  }
  if (hasPossession && inFinalThird && onWing) {
    return "cross";
  }
  if (hasPossession && inFinalThird) {
    return "progressive_pass";
  }
  if (hasPossession && movedTowardGoal) {
    return "progressive_pass";
  }
  return "off_ball_run";
}

function soccerStateConfidence(
  frame: TrackingFrame,
  players: TrackingFrame["objects"],
  ball: TrackingFrame["objects"][number] | undefined,
  hasPossession: boolean,
) {
  const playerMean =
    players.reduce((sum, player) => sum + player.confidence, 0) /
    Math.max(players.length, 1);
  const ballBoost = ball ? ball.confidence * 0.18 : -0.1;
  const possessionBoost = hasPossession ? 0.06 : -0.05;
  // Uncalibrated / zoomed feeds stretch the full pitch — keep confidence honest.
  const calibrationCap = frame.calibrated ? 0.93 : 0.52;
  const uncalibratedPenalty = frame.calibrated ? 0 : -0.12;
  return Math.min(
    calibrationCap,
    clamp01(
      playerMean * 0.82 +
        ballBoost +
        possessionBoost +
        uncalibratedPenalty +
        0.08,
    ),
  );
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function trackingToBasketballState(
  frame: TrackingFrame,
  context: TrackingContext,
): BasketballCourtState | null {
  const players = frame.objects.filter((object) => object.kind === "player");
  if (players.length === 0) return null;
  const ball = bestBall(frame);
  const ballPoint = ball
    ? normalizedFieldPoint(ball, frame.frame, "basketball")
    : undefined;
  const ballHandler = nearestPlayer(players, ballPoint, frame, "basketball");
  const selectedPlayer = ballHandler?.player ?? players[0];
  const selectedPoint = normalizedFieldPoint(
    selectedPlayer,
    frame.frame,
    "basketball",
  );
  const selectedTeam = teamFor(selectedPlayer, context);
  const nearestOpponentFeet = nearestOpponentDistance(
    players,
    selectedPlayer,
    selectedPoint,
    selectedTeam,
    frame,
    context,
    "basketball",
    10,
  );
  const previousPlayer = context.previous?.objects.find(
    (object) => object.id === selectedPlayer.id,
  );
  const previousPoint = previousPlayer
    ? normalizedFieldPoint(previousPlayer, context.previous!.frame, "basketball")
    : undefined;
  const zone = basketballZone(selectedPoint);
  const hasPossession = Boolean(ballHandler && ballHandler.distance <= 6);

  return {
    sport: "basketball",
    timestampMs: Math.max(0, Math.round(frame.timestampMs)),
    courtZone: zone,
    hasPossession,
    defenderDistanceFeet: Math.max(0, nearestOpponentFeet),
    movementTowardZone: Boolean(
      previousPoint &&
        (Math.abs(selectedPoint.y - 25) > Math.abs(previousPoint.y - 25) ||
          Math.abs(selectedPoint.x - 47) > Math.abs(previousPoint.x - 47)),
    ),
    likelyAction:
      hasPossession && zone.includes("corner")
        ? "corner_three_attempt"
        : hasPossession
          ? "shot_or_pass"
          : "off_ball_movement",
    visualConfidence: stateConfidence(frame, players),
  };
}

function bestBall(frame: TrackingFrame) {
  return frame.objects
    .filter((object) => object.kind === "ball")
    .sort((a, b) => b.confidence - a.confidence)[0];
}

function nearestPlayer(
  players: TrackingFrame["objects"],
  ballPoint: { x: number; y: number } | undefined,
  frame: TrackingFrame,
  sport: Sport,
) {
  if (!ballPoint) return undefined;
  return players
    .map((player) => ({
      player,
      distance: distance(
        normalizedFieldPoint(player, frame.frame, sport),
        ballPoint,
      ),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
}

function teamFor(
  player: TrackingFrame["objects"][number],
  context: TrackingContext,
): Team {
  return context.teamAssignments?.[player.id] ?? player.team ?? "unknown";
}

function nearestOpponentDistance(
  players: TrackingFrame["objects"],
  selectedPlayer: TrackingFrame["objects"][number],
  selectedPoint: { x: number; y: number },
  selectedTeam: Team,
  frame: TrackingFrame,
  context: TrackingContext,
  sport: Sport,
  fallback: number,
) {
  const opponents = players.filter((player) => {
    if (player.id === selectedPlayer.id) return false;
    const team = teamFor(player, context);
    return selectedTeam === "unknown" || team === "unknown" || team !== selectedTeam;
  });
  return opponents.length
    ? Math.min(
        ...opponents.map((player) =>
          distance(
            selectedPoint,
            normalizedFieldPoint(player, frame.frame, sport),
          ),
        ),
      )
    : fallback;
}

function stateConfidence(
  frame: TrackingFrame,
  players: TrackingFrame["objects"],
) {
  return Math.min(
    frame.calibrated ? 0.9 : 0.52,
    players.reduce((sum, player) => sum + player.confidence, 0) /
      players.length -
      (frame.calibrated ? 0 : 0.1),
  );
}
