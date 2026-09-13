import { describe, expect, it } from "vitest";
import {
  findLiveMatch,
  formatLiveCommentary,
  formatLiveMinute,
  matchTeams,
  type ApiFootballFixture,
} from "../src/integrations/api-football";

const baseMatch: ApiFootballFixture = {
  fixture: {
    id: 1001,
    status: { short: "2H", elapsed: 67, extra: null },
  },
  league: { name: "Premier League" },
  teams: {
    home: { name: "Arsenal" },
    away: { name: "Chelsea" },
  },
  goals: { home: 2, away: 1 },
};

describe("api-football live helpers", () => {
  it("matches swapped or abbreviated team names", () => {
    expect(matchTeams("Arsenal", "Chelsea", "Arsenal FC", "Chelsea")).toBe(true);
    expect(matchTeams("Arsenal", "Chelsea", "Chelsea", "Arsenal")).toBe(true);
    expect(matchTeams("Arsenal", "Chelsea", "Liverpool", "Chelsea")).toBe(false);
  });

  it("finds the live match for a fixture", () => {
    const match = findLiveMatch([baseMatch], "Arsenal", "Chelsea");
    expect(match?.fixture.id).toBe(1001);
    expect(match?.goals.home).toBe(2);
  });

  it("formats minute and commentary", () => {
    expect(formatLiveMinute(baseMatch)).toBe("67' · 2H");
    expect(
      formatLiveCommentary([
        {
          time: { elapsed: 67 },
          type: "Goal",
          detail: "Normal Goal",
          team: { name: "Arsenal" },
          player: { name: "Saka" },
        },
        {
          time: { elapsed: 70 },
          type: "Card",
          detail: "Yellow Card",
          team: { name: "Chelsea" },
          player: { name: "Palmer" },
        },
      ]),
    ).toContain("70' Card · Yellow Card · Chelsea · Palmer");
  });
});
