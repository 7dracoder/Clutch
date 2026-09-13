import { describe, expect, it } from "vitest";
import { createTreasuryBriefing, TREASURY_BRIEFING_KEYS } from "../src/integrations/elevenlabs";
import {
  TREASURY_ANALYST_PROMPT,
  TREASURY_ANALYST_VARIABLE_KEYS,
  treasuryAnalystToolDefinitions,
} from "../src/integrations/treasury-analyst-agent";
import {
  buildMatchContextQueries,
  filterResearchImages,
  matchResearchRequestSchema,
} from "../src/integrations/tavily";
import { inferMatchHints } from "../src/integrations/match-hints";
import type { RiskAssessment } from "../src/domain/types";

const risk: RiskAssessment = {
  prediction: {
    event: "shot_on_goal",
    attemptProbability: 0.68,
    makeProbability: 0.18,
    confidence: 0.72,
    factors: ["Open penalty-area possession"],
  },
  liquidity: {
    checkingBalanceCents: 2_000_000,
    pendingOutflowsCents: 250_000,
    payoutReserveCents: 500_000,
    safeCashCents: 1_250_000,
  },
  maximumExposureCents: 1_200_000,
  probabilityWeightedExposureCents: 216_000,
  liquidityBufferCents: 50_000,
  status: "watch",
  generatedAt: "2026-09-13T00:00:00.000Z",
};

describe("treasury analyst briefing", () => {
  it("keeps briefing keys aligned with the agent prompt", () => {
    const briefing = createTreasuryBriefing(risk, undefined, {
      sport: "soccer",
      timestampMs: 4_200,
      courtZone: "attacking_penalty_area",
      hasPossession: true,
      defenderDistanceMeters: 5.4,
      attackingDirection: "right",
      teamInPossession: "offense",
      movementTowardZone: true,
      likelyAction: "shot_on_goal",
      visualConfidence: 0.9,
    });

    expect(Object.keys(briefing)).toEqual([...TREASURY_BRIEFING_KEYS]);
    expect([...TREASURY_BRIEFING_KEYS]).toEqual([
      ...TREASURY_ANALYST_VARIABLE_KEYS,
    ]);
    for (const key of TREASURY_BRIEFING_KEYS) {
      expect(TREASURY_ANALYST_PROMPT).toContain(`{{${key}}}`);
    }
    expect(briefing.court_zone).toBe("attacking_penalty_area");
    expect(briefing.team_in_possession).toBe("offense");
    expect(briefing.likely_action).toBe("shot_on_goal");
    expect(briefing.detection_source).toBe("live_vision plus text research");
    expect(
      createTreasuryBriefing(undefined, undefined, undefined, {
        fixture: "Sunderland vs Arsenal",
        sport: "soccer",
      }).fixture,
    ).toBe("Sunderland vs Arsenal");
  });

  it("registers the searchMatchContext client tool", () => {
    expect(treasuryAnalystToolDefinitions.map((tool) => tool.name)).toEqual([
      "openRhoLedger",
      "focusLiveCourt",
      "showRiskBreakdown",
      "openResearchContext",
      "searchMatchContext",
      "listOpenAlerts",
      "presentAlert",
      "confirmAlert",
      "rejectAlert",
    ]);
  });
});

describe("match research helpers", () => {
  it("builds preview and logo queries from team and competition", () => {
    expect(
      buildMatchContextQueries({
        query: "injuries",
        team: "Real Madrid",
        competition: "LaLiga",
      }),
    ).toEqual({
      contextQuery:
        "injuries Real Madrid LaLiga match preview injuries availability lineup",
      logoQuery: "Real Madrid LaLiga official club competition logo",
    });
  });

  it("keeps https images and drops tracking pixels", () => {
    expect(
      filterResearchImages([
        "http://example.com/logo.png",
        "https://cdn.example.com/1x1.gif",
        "https://facebook.com/tr?id=1",
        {
          url: "https://cdn.example.com/laliga-logo.png",
          description: "LaLiga crest",
        },
        "https://cdn.example.com/laliga-logo.png",
        "not-a-url",
      ]),
    ).toEqual([
      {
        url: "https://cdn.example.com/laliga-logo.png",
        description: "LaLiga crest",
      },
    ]);
  });

  it("validates the research route schema", () => {
    expect(() => matchResearchRequestSchema.parse({ query: "" })).toThrow();
    expect(
      matchResearchRequestSchema.parse({
        query: "LaLiga logos",
        team: "Real Madrid",
      }),
    ).toEqual({
      query: "LaLiga logos",
      team: "Real Madrid",
    });
  });

  it("infers competition from a licensed source URL", () => {
    expect(
      inferMatchHints({
        sourceUrl: "https://www.laliga.com/en-GB/match",
        licenseNote: "Official LaLiga broadcast feed",
      }),
    ).toMatchObject({ competition: "LaLiga" });
  });
});
