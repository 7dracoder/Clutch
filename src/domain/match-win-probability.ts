import type { SlateSport } from "@/domain/slate";

export type MatchWinProbability = {
  homePct: number;
  awayPct: number;
  /** Present for soccer (and other draw sports); 0 otherwise. */
  drawPct: number;
  mode: "two_way" | "three_way";
  leader: "home" | "away" | "draw" | "tossup";
  progressElapsed: number;
  label: string;
};

export type MatchWinProbabilityInput = {
  sport: SlateSport;
  status: "live" | "upcoming" | "final";
  homeScore?: string | number | null;
  awayScore?: string | number | null;
  detail?: string | null;
  /** Mild live-play tilt toward the side currently threatening (−1 away … +1 home). */
  liveTilt?: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const roundPct = (value: number) => Math.round(clamp(value, 0, 100));

function parseScore(value?: string | number | null): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const match = value.trim().match(/^-?\d+/);
  if (!match) return 0;
  return Number.parseInt(match[0], 10);
}

function sportSupportsDraw(sport: SlateSport) {
  return sport === "soccer" || sport === "hockey";
}

function scoreScale(sport: SlateSport) {
  switch (sport) {
    case "soccer":
      return 1.35;
    case "hockey":
      return 1.15;
    case "basketball":
      return 0.12;
    case "american_football":
      return 0.22;
    case "baseball":
      return 0.55;
    case "tennis":
      return 0.9;
    default:
      return 0.45;
  }
}

/** Fraction of regulation already played (0 → kickoff, 1 → finished). */
export function estimateProgressElapsed(
  sport: SlateSport,
  status: MatchWinProbabilityInput["status"],
  detail?: string | null,
): number {
  if (status === "upcoming") return 0;
  if (status === "final") return 1;

  const text = (detail ?? "").toLowerCase();

  if (sport === "soccer") {
    if (/\bft\b|full.?time|a\.?e\.?t|pen/.test(text)) return 1;
    if (/\bht\b|half.?time/.test(text)) return 0.5;
    const minute = text.match(/(\d{1,3})\s*'?/);
    if (minute) return clamp(Number.parseInt(minute[1], 10) / 90, 0, 1);
    if (/2nd|second/.test(text)) return 0.72;
    if (/1st|first/.test(text)) return 0.28;
    return 0.45;
  }

  if (sport === "basketball") {
    if (/q4|4th|ot|final/.test(text)) return 0.88;
    if (/q3|3rd/.test(text)) return 0.62;
    if (/q2|2nd|half/.test(text)) return 0.38;
    if (/q1|1st/.test(text)) return 0.12;
    return 0.5;
  }

  if (sport === "american_football") {
    if (/q4|4th|ot|final/.test(text)) return 0.88;
    if (/q3|3rd/.test(text)) return 0.62;
    if (/q2|2nd|half/.test(text)) return 0.4;
    if (/q1|1st/.test(text)) return 0.15;
    return 0.5;
  }

  if (sport === "hockey") {
    if (/3rd|ot|so|final/.test(text)) return 0.85;
    if (/2nd/.test(text)) return 0.55;
    if (/1st/.test(text)) return 0.2;
    return 0.5;
  }

  if (sport === "baseball") {
    const inning = text.match(/(\d+)(?:st|nd|rd|th)/);
    if (inning) return clamp(Number.parseInt(inning[1], 10) / 9, 0, 1);
    return 0.5;
  }

  if (sport === "tennis") {
    if (/set\s*5|5th/.test(text)) return 0.85;
    if (/set\s*4|4th/.test(text)) return 0.7;
    if (/set\s*3|3rd/.test(text)) return 0.55;
    if (/set\s*2|2nd/.test(text)) return 0.35;
    return 0.2;
  }

  return 0.5;
}

function softmax2(a: number, b: number): [number, number] {
  const max = Math.max(a, b);
  const ea = Math.exp(a - max);
  const eb = Math.exp(b - max);
  const sum = ea + eb;
  return [ea / sum, eb / sum];
}

function softmax3(a: number, b: number, c: number): [number, number, number] {
  const max = Math.max(a, b, c);
  const ea = Math.exp(a - max);
  const eb = Math.exp(b - max);
  const ec = Math.exp(c - max);
  const sum = ea + eb + ec;
  return [ea / sum, eb / sum, ec / sum];
}

function leaderFromPcts(
  homePct: number,
  awayPct: number,
  drawPct: number,
): MatchWinProbability["leader"] {
  const top = Math.max(homePct, awayPct, drawPct);
  if (top < 40) return "tossup";
  if (homePct === top && homePct > awayPct && homePct > drawPct) return "home";
  if (awayPct === top && awayPct > homePct && awayPct > drawPct) return "away";
  if (drawPct === top && drawPct >= homePct && drawPct >= awayPct) return "draw";
  if (Math.abs(homePct - awayPct) <= 2 && drawPct < top) return "tossup";
  return homePct >= awayPct ? "home" : "away";
}

/**
 * Desk-side match win probabilities (not exchange odds).
 * Uses score margin + elapsed progress, with a light home-field prior.
 */
export function estimateMatchWinProbability(
  input: MatchWinProbabilityInput,
): MatchWinProbability {
  const homeScore = parseScore(input.homeScore);
  const awayScore = parseScore(input.awayScore);
  const progressElapsed = estimateProgressElapsed(
    input.sport,
    input.status,
    input.detail,
  );
  const threeWay = sportSupportsDraw(input.sport);
  const margin = homeScore - awayScore;
  const lateFactor = 0.35 + progressElapsed * 2.4;
  const tilt = clamp(input.liveTilt ?? 0, -1, 1) * 0.22;

  if (input.status === "final") {
    if (threeWay && margin === 0) {
      return {
        homePct: 0,
        awayPct: 0,
        drawPct: 100,
        mode: "three_way",
        leader: "draw",
        progressElapsed: 1,
        label: "Final",
      };
    }
    if (margin > 0) {
      return {
        homePct: 100,
        awayPct: 0,
        drawPct: 0,
        mode: threeWay ? "three_way" : "two_way",
        leader: "home",
        progressElapsed: 1,
        label: "Final",
      };
    }
    if (margin < 0) {
      return {
        homePct: 0,
        awayPct: 100,
        drawPct: 0,
        mode: threeWay ? "three_way" : "two_way",
        leader: "away",
        progressElapsed: 1,
        label: "Final",
      };
    }
  }

  const homeField = input.status === "upcoming" ? 0.12 : 0.08;
  const homeStrength =
    homeField + margin * scoreScale(input.sport) * lateFactor + tilt;
  const awayStrength =
    -homeField - margin * scoreScale(input.sport) * lateFactor - tilt;

  let homePct: number;
  let awayPct: number;
  let drawPct = 0;

  if (threeWay) {
    const drawBase =
      margin === 0
        ? 0.15 + progressElapsed * 0.35
        : Math.max(0.02, 0.28 - Math.abs(margin) * 0.16 - progressElapsed * 0.08);
    const drawStrength = Math.log(drawBase / Math.max(1e-6, 1 - drawBase));
    const [home, away, draw] = softmax3(
      homeStrength,
      awayStrength,
      drawStrength,
    );
    homePct = roundPct(home * 100);
    awayPct = roundPct(away * 100);
    drawPct = clamp(100 - homePct - awayPct, 0, 100);
  } else {
    const [home, away] = softmax2(homeStrength, awayStrength);
    homePct = roundPct(home * 100);
    awayPct = clamp(100 - homePct, 0, 100);
  }

  // Guard against rounding drift.
  const total = homePct + awayPct + drawPct;
  if (total !== 100) {
    homePct = clamp(homePct + (100 - total), 0, 100);
  }

  return {
    homePct,
    awayPct,
    drawPct,
    mode: threeWay ? "three_way" : "two_way",
    leader: leaderFromPcts(homePct, awayPct, drawPct),
    progressElapsed,
    label: input.status === "upcoming" ? "Pre-match" : "Live",
  };
}
