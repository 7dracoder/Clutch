import type { SlateEvent } from "@/domain/slate";

/** Stable pseudo-random from a string (same fixture → same series). */
function hashSeed(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FixtureExposurePoint {
  label: string;
  value: number;
}

export interface FixtureExposureSeries {
  points: FixtureExposurePoint[];
  currentCents: number;
  deltaPercent: number;
  openBets: number;
}

const POINT_COUNT = 14;

export function buildFixtureExposureSeries(event: SlateEvent): FixtureExposureSeries {
  const rand = mulberry32(hashSeed(event.id));
  const sportMultiplier =
    event.sport === "soccer"
      ? 1
      : event.sport === "basketball" || event.sport === "american_football"
        ? 1.15
        : event.sport === "motorsport"
          ? 0.85
          : 0.95;
  const statusMultiplier =
    event.status === "live" ? 1.35 : event.status === "upcoming" ? 0.75 : 0.5;
  const base = (180_000 + rand() * 920_000) * sportMultiplier * statusMultiplier;

  const points: FixtureExposurePoint[] = [];
  let value = base * (0.55 + rand() * 0.25);
  for (let index = 0; index < POINT_COUNT; index += 1) {
    const drift = (rand() - 0.42) * base * 0.08;
    const livePulse =
      event.status === "live" && index > POINT_COUNT - 4
        ? base * (0.04 + rand() * 0.06)
        : 0;
    value = Math.max(base * 0.35, value + drift + livePulse);
    points.push({
      label: `${index + 1}`,
      value: Math.round(value),
    });
  }

  const currentCents = points.at(-1)?.value ?? Math.round(base);
  const firstCents = points[0]?.value ?? currentCents;
  const deltaPercent =
    firstCents > 0
      ? Math.round(((currentCents - firstCents) / firstCents) * 100)
      : 0;
  const openBets = Math.max(
    12,
    Math.round((currentCents / 100 / (2.4 + rand() * 3.2)) * statusMultiplier),
  );

  return { points, currentCents, deltaPercent, openBets };
}

export function formatExposureCompact(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}
