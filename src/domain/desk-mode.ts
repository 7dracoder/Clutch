import type { SlateEvent } from "@/domain/slate";
import { estimateMatchWinProbability } from "@/domain/match-win-probability";
import type { EventPrediction } from "@/domain/types";

export type DeskMode = "treasury" | "personal";

export const DESK_MODE_STORAGE_KEY = "clutch.desk-mode";

export function isDeskMode(value: unknown): value is DeskMode {
  return value === "treasury" || value === "personal";
}

export type PersonalLeadStance = "lean" | "watch" | "pass";

export type PersonalLead = {
  side: "home" | "away" | "draw" | "none";
  sideLabel: string;
  strengthPct: number;
  stance: PersonalLeadStance;
  headline: string;
  blurb: string;
  reasons: string[];
  liveEdgePct: number | null;
};

/**
 * Turn system win-prob + live event probs into a personal bet-decision lead.
 * Decision support only — does not place bets.
 */
export function derivePersonalLead(input: {
  event?: SlateEvent | null;
  prediction?: EventPrediction | null;
}): PersonalLead {
  const event = input.event;
  const prediction = input.prediction;

  if (!event) {
    return {
      side: "none",
      sideLabel: "No fixture",
      strengthPct: 0,
      stance: "pass",
      headline: "Pick a fixture to see a personal lead",
      blurb:
        "Personal mode uses Clutch win probability and live action signals as decision support only. It does not place bets.",
      reasons: [
        "Open a game from Watch Slate",
        "Live leads appear after tracking attaches",
        "Always size your own risk",
      ],
      liveEdgePct: null,
    };
  }

  const win = estimateMatchWinProbability({
    sport: event.sport,
    status: event.status,
    homeScore: event.home.score,
    awayScore: event.away.score,
    detail: event.detail,
  });

  const side =
    win.leader === "tossup"
      ? "none"
      : win.leader === "home" || win.leader === "away" || win.leader === "draw"
        ? win.leader
        : "none";

  const strengthPct =
    side === "home"
      ? win.homePct
      : side === "away"
        ? win.awayPct
        : side === "draw"
          ? win.drawPct
          : Math.max(win.homePct, win.awayPct, win.drawPct);

  const sideLabel =
    side === "home"
      ? event.home.name
      : side === "away"
        ? event.away.name
        : side === "draw"
          ? "Draw"
          : "Too close";

  const liveEdgePct = prediction
    ? Math.round(prediction.makeProbability * 100)
    : null;
  const attemptPct = prediction
    ? Math.round(prediction.attemptProbability * 100)
    : null;
  const confidencePct = prediction
    ? Math.round(prediction.confidence * 100)
    : null;

  let stance: PersonalLeadStance = "pass";
  if (side !== "none" && strengthPct >= 58) stance = "lean";
  else if (side !== "none" && strengthPct >= 52) stance = "watch";
  if (
    prediction &&
    prediction.makeProbability >= 0.18 &&
    prediction.attemptProbability >= 0.45 &&
    prediction.confidence >= 0.45
  ) {
    stance = stance === "pass" ? "watch" : "lean";
  }
  if (confidencePct != null && confidencePct < 40) {
    stance = "pass";
  }

  const reasons = [
    side === "none"
      ? "Match win probabilities are nearly even"
      : `${sideLabel} leads match win probability at ${strengthPct}%`,
    prediction
      ? `Live ${prediction.event.replaceAll("_", " ")} · shot ${attemptPct}% · finish ${liveEdgePct}%`
      : "Waiting on live possession for an in-play edge",
    confidencePct != null
      ? `Signal confidence ${confidencePct}%${
          confidencePct < 40 ? " — treat as weak" : ""
        }`
      : "Calibrate the pitch for stronger live confidence",
  ];

  const stanceCopy =
    stance === "lean"
      ? "Lean with the lead if your market price still looks soft."
      : stance === "watch"
        ? "Watch the price — edge is thin or still forming."
        : "Pass or keep stakes tiny until the lead clears up.";

  return {
    side,
    sideLabel,
    strengthPct,
    stance,
    headline:
      side === "none"
        ? "No clear personal lead yet"
        : `Personal lead · ${sideLabel}`,
    blurb: `${stanceCopy} Decision support only — Clutch does not place bets for you.`,
    reasons,
    liveEdgePct,
  };
}

export function personalStanceLabel(stance: PersonalLeadStance) {
  if (stance === "lean") return "Lean";
  if (stance === "watch") return "Watch";
  return "Pass";
}
