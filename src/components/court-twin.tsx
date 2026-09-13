import type { CourtState, RiskAssessment } from "@/domain/types";
import { basketballDemoTimeline } from "@/data/basketball-demo";
import { soccerDemoTimeline } from "@/data/soccer-demo";
import type { TrackingFrame } from "@/features/live-capture/types";

interface CourtTwinProps {
  tracking: TrackingFrame | null;
  courtState: CourtState | null;
  risk: RiskAssessment | null;
  preferredSport?: "soccer" | "basketball";
}

const field = { x: 18, y: 18, width: 524, height: 334 };

function mapPoint(
  point: { x: number; y: number },
  dimensions: { width: number; height: number },
) {
  return {
    x: field.x + (point.x / dimensions.width) * field.width,
    y: field.y + (point.y / dimensions.height) * field.height,
  };
}

export function CourtTwin({
  tracking,
  courtState,
  risk,
  preferredSport = "soccer",
}: CourtTwinProps) {
  const sport = courtState?.sport ?? preferredSport;
  const dimensions =
    sport === "soccer"
      ? { width: 105, height: 68 }
      : { width: 94, height: 50 };
  const liveObjects = tracking?.objects ?? [];
  const trackedPoint = (object: (typeof liveObjects)[number]) =>
    object.fieldPoint ??
    (tracking
      ? {
          x: (object.videoPoint.x / tracking.frame.width) * dimensions.width,
          y: (object.videoPoint.y / tracking.frame.height) * dimensions.height,
        }
      : undefined);
  const soccerDemo = soccerDemoTimeline.at(-1)!;
  const basketballDemo = basketballDemoTimeline.at(-1)!;
  const players =
    tracking
      ? liveObjects
          .filter(
            (object) =>
              object.kind === "player" || object.kind === "official",
          )
          .map((object, index) => ({
            id: object.id,
            role:
              object.role ??
              (object.kind === "official" ? "referee" : "player"),
            team:
              object.team === "offense" || object.team === "defense"
                ? object.team
                : ("unknown" as const),
            fallbackTeam:
              index % 2 === 0
                ? ("offense" as const)
                : ("defense" as const),
            point: mapPoint(trackedPoint(object)!, dimensions),
          }))
      : sport === "soccer"
        ? soccerDemo.playerPositions.map((player) => ({
            ...player,
            fallbackTeam: player.team,
            point: mapPoint(player, dimensions),
          }))
        : basketballDemo.playerPositions.map((player) => ({
            ...player,
            role: "player",
            fallbackTeam: player.team,
            point: mapPoint(
              {
                x: (player.x / 100) * 94,
                y: (player.y / 100) * 50,
              },
              dimensions,
            ),
          }));
  const ballObject = liveObjects.find((object) => object.kind === "ball");
  const liveBallPoint = ballObject ? trackedPoint(ballObject) : undefined;
  const ballPoint = liveBallPoint
    ? mapPoint(liveBallPoint, dimensions)
    : tracking
      ? null
      : mapPoint(
        sport === "soccer" ? soccerDemo.ball : { x: 62, y: 25 },
        dimensions,
      );
  const targetRight =
    courtState?.sport === "soccer"
      ? courtState.attackingDirection === "right"
      : !courtState?.courtZone.startsWith("left");
  const resolvedTeam = (player: (typeof players)[number]) =>
    player.team === "unknown" ? player.fallbackTeam : player.team;
  const fieldPlayers = players.filter((player) => player.role !== "referee");
  const possessionTeam =
    courtState?.sport === "soccer" ? courtState.teamInPossession : "offense";
  const possessionPlayer = ballPoint
    ? fieldPlayers.reduce<(typeof fieldPlayers)[number] | undefined>(
        (nearest, player) =>
          !nearest ||
          Math.hypot(
            player.point.x - ballPoint.x,
            player.point.y - ballPoint.y,
          ) <
            Math.hypot(
              nearest.point.x - ballPoint.x,
              nearest.point.y - ballPoint.y,
            )
            ? player
            : nearest,
        undefined,
      )
    : fieldPlayers.find(
        (player) =>
          possessionTeam !== "unknown" &&
          resolvedTeam(player) === possessionTeam,
      );
  const pathStart = possessionPlayer?.point;
  const shotTarget = targetRight
    ? { x: sport === "soccer" ? 530 : 488, y: 185 }
    : { x: sport === "soccer" ? 30 : 72, y: 185 };
  const showShotPath =
    Boolean(pathStart && courtState?.hasPossession) &&
    (courtState?.likelyAction === "shot_on_goal" ||
      courtState?.courtZone.includes("penalty_area"));
  const forwardSign = targetRight ? 1 : -1;
  const passingTargets = possessionPlayer
    ? fieldPlayers
        .filter(
          (player) =>
            player.id !== possessionPlayer.id &&
            player.role !== "goalkeeper" &&
            resolvedTeam(player) === resolvedTeam(possessionPlayer) &&
            (player.point.x - possessionPlayer.point.x) * forwardSign > 8,
        )
        .sort(
          (first, second) =>
            Math.hypot(
              first.point.x - possessionPlayer.point.x,
              first.point.y - possessionPlayer.point.y,
            ) -
            Math.hypot(
              second.point.x - possessionPlayer.point.x,
              second.point.y - possessionPlayer.point.y,
            ),
        )
        .slice(0, 2)
        .map((player) => player.point)
    : [];
  const potentialTargets =
    !showShotPath && pathStart && passingTargets.length === 0
      ? [
          {
            x: Math.max(35, Math.min(525, pathStart.x + forwardSign * 90)),
            y: Math.max(45, pathStart.y - 55),
          },
          {
            x: Math.max(35, Math.min(525, pathStart.x + forwardSign * 90)),
            y: Math.min(325, pathStart.y + 55),
          },
        ]
      : passingTargets;
  const status = risk?.status ?? "safe";

  return (
    <svg
      viewBox="0 0 560 370"
      role="img"
      aria-label={`Top-down ${sport === "soccer" ? "soccer pitch" : "basketball court"} showing tracked players and risk zone`}
      className="court-svg"
    >
      <rect
        x={field.x}
        y={field.y}
        width={field.width}
        height={field.height}
        className="court-boundary"
      />
      {sport === "soccer" ? <SoccerMarkings /> : <BasketballMarkings />}
      <rect
        x={targetRight ? (sport === "soccer" ? 453 : 437) : 18}
        y={sport === "soccer" ? 86 : 18}
        width={sport === "soccer" ? 89 : 105}
        height={sport === "soccer" ? 198 : 84}
        className={`court-risk-zone court-risk-zone--${status}`}
      />
      {showShotPath && pathStart ? (
        <path
          d={`M${pathStart.x} ${pathStart.y} Q${(pathStart.x + shotTarget.x) / 2} ${
            pathStart.y - 40
          } ${shotTarget.x} ${shotTarget.y}`}
          className="prediction-path"
        />
      ) : null}
      {pathStart
        ? potentialTargets.map((target, index) => (
            <path
              key={`${target.x}-${target.y}-${index}`}
              d={`M${pathStart.x} ${pathStart.y} Q${
                (pathStart.x + target.x) / 2
              } ${(pathStart.y + target.y) / 2 - 18} ${target.x} ${target.y}`}
              className="prediction-path prediction-path--position"
            />
          ))
        : null}
      {players.map((player) => {
        const team =
          player.team === "unknown" ? player.fallbackTeam : player.team;
        const role = player.role;
        return (
          <g key={player.id}>
            <circle
              cx={player.point.x}
              cy={player.point.y}
              r={role === "referee" ? 8 : 11}
              className={`court-player court-player--${role === "referee" ? "official" : team}`}
            />
            <text
              x={player.point.x}
              y={player.point.y + 3}
              textAnchor="middle"
              className="court-player-label"
            >
              {role === "goalkeeper"
                ? "G"
                : role === "referee"
                  ? "R"
                  : player.id.replace(/\D/g, "").slice(-1) || "•"}
            </text>
          </g>
        );
      })}
      {ballPoint ? (
        <circle cx={ballPoint.x} cy={ballPoint.y} r="6" className="court-ball" />
      ) : null}
      {tracking && liveObjects.length === 0 ? (
        <text x="280" y="185" textAnchor="middle" className="court-risk-label">
          NO TRACKS IN THIS FRAME
        </text>
      ) : tracking && !tracking.calibrated ? (
        <text x="280" y="328" textAnchor="middle" className="court-risk-label">
          APPROXIMATE · CAMERA SHOWS PARTIAL FIELD
        </text>
      ) : null}
      {tracking && !tracking.calibrated ? (
        <text x="280" y="348" textAnchor="middle" className="court-risk-label">
          CALIBRATE PITCH ON THE LIVE FEED FOR TRUE SCALE
        </text>
      ) : null}
      <text x={targetRight ? 462 : 28} y="78" className="court-risk-label">
        RISK ZONE
      </text>
    </svg>
  );
}

function SoccerMarkings() {
  return (
    <>
      <line x1="280" y1="18" x2="280" y2="352" className="court-line" />
      <circle cx="280" cy="185" r="45" className="court-line court-fill-none" />
      <circle cx="280" cy="185" r="3" className="court-line" />
      <rect x="18" y="86" width="82" height="198" className="court-line court-fill-none" />
      <rect x="460" y="86" width="82" height="198" className="court-line court-fill-none" />
      <rect x="18" y="135" width="30" height="100" className="court-line court-fill-none" />
      <rect x="512" y="135" width="30" height="100" className="court-line court-fill-none" />
      <rect x="10" y="158" width="8" height="54" className="court-line court-fill-none" />
      <rect x="542" y="158" width="8" height="54" className="court-line court-fill-none" />
      <circle cx="76" cy="185" r="3" className="court-line" />
      <circle cx="484" cy="185" r="3" className="court-line" />
    </>
  );
}

function BasketballMarkings() {
  return (
    <>
      <line x1="280" y1="18" x2="280" y2="352" className="court-line" />
      <circle cx="280" cy="185" r="48" className="court-line court-fill-none" />
      <rect x="18" y="105" width="105" height="160" className="court-line court-fill-none" />
      <rect x="437" y="105" width="105" height="160" className="court-line court-fill-none" />
      <path d="M123 122 A76 76 0 0 1 123 248" className="court-line court-fill-none" />
      <path d="M437 122 A76 76 0 0 0 437 248" className="court-line court-fill-none" />
      <line x1="48" y1="155" x2="48" y2="215" className="court-basket" />
      <line x1="512" y1="155" x2="512" y2="215" className="court-basket" />
    </>
  );
}
