import { describe, expect, it } from "vitest";
import { derivePersonalLead } from "../src/domain/desk-mode";
import type { SlateEvent } from "../src/domain/slate";

const event: SlateEvent = {
  id: "demo",
  sport: "soccer",
  competition: "Friendly",
  status: "live",
  startAt: "2026-09-13T00:00:00.000Z",
  detail: "67'",
  home: { name: "Home FC", score: "2" },
  away: { name: "Away United", score: "0" },
  source: "scoreboard",
};

describe("personal desk mode lead", () => {
  it("leans toward the leading side from win probability", () => {
    const lead = derivePersonalLead({
      event,
      prediction: {
        event: "shot_on_goal",
        attemptProbability: 0.7,
        makeProbability: 0.22,
        confidence: 0.7,
        factors: ["box threat"],
      },
    });
    expect(lead.side).toBe("home");
    expect(lead.sideLabel).toBe("Home FC");
    expect(lead.strengthPct).toBeGreaterThan(55);
    expect(["lean", "watch"]).toContain(lead.stance);
  });

  it("passes when confidence is weak", () => {
    const lead = derivePersonalLead({
      event: {
        ...event,
        home: { name: "Home FC", score: "1" },
        away: { name: "Away United", score: "1" },
        detail: "20'",
      },
      prediction: {
        event: "progressive_pass",
        attemptProbability: 0.2,
        makeProbability: 0.05,
        confidence: 0.3,
        factors: ["weak"],
      },
    });
    expect(lead.stance).toBe("pass");
  });
});
