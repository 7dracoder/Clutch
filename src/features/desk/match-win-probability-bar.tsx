"use client";

import type { SlateEvent } from "@/domain/slate";
import {
  estimateMatchWinProbability,
  type MatchWinProbability,
} from "@/domain/match-win-probability";
import { TeamMark } from "@/features/slate/team-mark";

function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return name;
  return parts[parts.length - 1] ?? name;
}

export function MatchWinProbabilityBar({
  event,
  liveTilt = 0,
  personalMode = false,
}: {
  event: SlateEvent;
  liveTilt?: number;
  personalMode?: boolean;
}) {
  const probability = estimateMatchWinProbability({
    sport: event.sport,
    status: event.status,
    homeScore: event.home.score,
    awayScore: event.away.score,
    detail: event.detail,
    liveTilt,
  });

  return (
    <section
      className="win-prob"
      aria-label={`${probability.label} win probability`}
    >
      <div className="win-prob-head">
        <p className="win-prob-kicker">
          {personalMode ? "Personal match lead" : "Win probability"}
        </p>
        <p className="win-prob-meta">
          {probability.label}
          {event.detail ? ` · ${event.detail}` : ""}
        </p>
      </div>

      <div className="win-prob-teams">
        <div className="win-prob-side win-prob-side--away">
          <TeamMark name={event.away.name} logoUrl={event.away.logoUrl} />
          <div className="win-prob-side-copy">
            <span className="win-prob-team-name">{shortName(event.away.name)}</span>
            <strong className="win-prob-pct">{probability.awayPct}%</strong>
          </div>
        </div>

        {probability.mode === "three_way" ? (
          <div className="win-prob-draw" title="Draw">
            <span>Draw</span>
            <strong>{probability.drawPct}%</strong>
          </div>
        ) : (
          <div className="win-prob-vs" aria-hidden="true">
            vs
          </div>
        )}

        <div className="win-prob-side win-prob-side--home">
          <div className="win-prob-side-copy win-prob-side-copy--end">
            <span className="win-prob-team-name">{shortName(event.home.name)}</span>
            <strong className="win-prob-pct">{probability.homePct}%</strong>
          </div>
          <TeamMark name={event.home.name} logoUrl={event.home.logoUrl} />
        </div>
      </div>

      <WinProbTrack probability={probability} />

      <p className="win-prob-caption">
        {captionFor(probability, event, personalMode)}
      </p>
    </section>
  );
}

function WinProbTrack({ probability }: { probability: MatchWinProbability }) {
  return (
    <div
      className="win-prob-track"
      role="img"
      aria-label={
        probability.mode === "three_way"
          ? `Away ${probability.awayPct}%, draw ${probability.drawPct}%, home ${probability.homePct}%`
          : `Away ${probability.awayPct}%, home ${probability.homePct}%`
      }
    >
      <span
        className="win-prob-seg win-prob-seg--away"
        style={{ width: `${probability.awayPct}%` }}
      />
      {probability.mode === "three_way" ? (
        <span
          className="win-prob-seg win-prob-seg--draw"
          style={{ width: `${probability.drawPct}%` }}
        />
      ) : null}
      <span
        className="win-prob-seg win-prob-seg--home"
        style={{ width: `${probability.homePct}%` }}
      />
    </div>
  );
}

function captionFor(
  probability: MatchWinProbability,
  event: SlateEvent,
  personalMode = false,
) {
  if (probability.leader === "draw") {
    return probability.label === "Final"
      ? "Match finished level"
      : personalMode
        ? "Draw is the system lead — only bet it if the price is soft"
        : "Draw is the most likely result right now";
  }
  if (probability.leader === "tossup") {
    return personalMode
      ? "Too close to call — prefer Pass until a side clears"
      : "Too close to call";
  }
  const leader =
    probability.leader === "home" ? event.home.name : event.away.name;
  if (probability.label === "Final") return `${leader} won`;
  return personalMode
    ? `${leader} is the system lead — compare to your market price before staking`
    : `${leader} favored to win`;
}
