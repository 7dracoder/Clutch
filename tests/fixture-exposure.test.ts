import { describe, expect, it } from "vitest";
import { buildFixtureExposureSeries } from "../src/lib/fixture-exposure";
import type { SlateEvent } from "../src/domain/slate";

const sampleEvent: SlateEvent = {
  id: "espn:soccer:401",
  sport: "soccer",
  competition: "Premier League",
  status: "live",
  startAt: "2026-09-13T19:30:00.000Z",
  detail: "32'",
  home: { name: "Arsenal" },
  away: { name: "Chelsea" },
  source: "scoreboard",
};

describe("fixture exposure series", () => {
  it("returns stable series for the same fixture", () => {
    const first = buildFixtureExposureSeries(sampleEvent);
    const second = buildFixtureExposureSeries(sampleEvent);
    expect(first.currentCents).toBe(second.currentCents);
    expect(first.points.length).toBe(14);
  });

  it("ramps higher for live fixtures than upcoming", () => {
    const live = buildFixtureExposureSeries(sampleEvent);
    const upcoming = buildFixtureExposureSeries({
      ...sampleEvent,
      id: "espn:soccer:402",
      status: "upcoming",
    });
    expect(live.openBets).toBeGreaterThan(0);
    expect(upcoming.openBets).toBeGreaterThan(0);
  });
});
