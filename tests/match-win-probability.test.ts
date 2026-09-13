import { describe, expect, it } from "vitest";
import {
  estimateMatchWinProbability,
  estimateProgressElapsed,
} from "../src/domain/match-win-probability";

describe("match win probability", () => {
  it("parses soccer minute progress", () => {
    expect(estimateProgressElapsed("soccer", "live", "67'")).toBeCloseTo(
      67 / 90,
      2,
    );
    expect(estimateProgressElapsed("soccer", "live", "HT")).toBe(0.5);
    expect(estimateProgressElapsed("soccer", "final", "FT")).toBe(1);
  });

  it("favors the leading side later in the match", () => {
    const early = estimateMatchWinProbability({
      sport: "soccer",
      status: "live",
      homeScore: "1",
      awayScore: "0",
      detail: "20'",
    });
    const late = estimateMatchWinProbability({
      sport: "soccer",
      status: "live",
      homeScore: "1",
      awayScore: "0",
      detail: "84'",
    });
    expect(late.homePct).toBeGreaterThan(early.homePct);
    expect(early.drawPct + early.homePct + early.awayPct).toBe(100);
    expect(late.drawPct + late.homePct + late.awayPct).toBe(100);
  });

  it("locks final results", () => {
    const homeWin = estimateMatchWinProbability({
      sport: "basketball",
      status: "final",
      homeScore: "110",
      awayScore: "104",
      detail: "Final",
    });
    expect(homeWin.homePct).toBe(100);
    expect(homeWin.awayPct).toBe(0);
    expect(homeWin.leader).toBe("home");

    const draw = estimateMatchWinProbability({
      sport: "soccer",
      status: "final",
      homeScore: "1",
      awayScore: "1",
      detail: "FT",
    });
    expect(draw.drawPct).toBe(100);
    expect(draw.leader).toBe("draw");
  });

  it("starts near even before kickoff with a slight home lean", () => {
    const pre = estimateMatchWinProbability({
      sport: "soccer",
      status: "upcoming",
      homeScore: "0",
      awayScore: "0",
      detail: "Kickoff 7:30 PM ET",
    });
    expect(pre.homePct).toBeGreaterThanOrEqual(pre.awayPct);
    expect(pre.homePct + pre.awayPct + pre.drawPct).toBe(100);
    expect(pre.label).toBe("Pre-match");
  });
});
