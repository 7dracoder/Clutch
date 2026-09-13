import { describe, expect, it } from "vitest";
import {
  deriveNewsPredictionModifiers,
  evidenceFromMatchIntel,
  mergeNewsModifiers,
} from "../src/domain/news-modifiers";

describe("news prediction modifiers", () => {
  it("softens scoring when injury language dominates", () => {
    const modifiers = deriveNewsPredictionModifiers(
      "Star striker ruled out injured hamstring doubtful for tonight",
    );
    expect(modifiers.scoringRateMultiplier).toBeLessThan(1);
    expect(modifiers.attemptMultiplier).toBeLessThan(1);
    expect(modifiers.confidenceModifier).toBeLessThan(0);
    expect(modifiers.notes.length).toBeGreaterThan(0);
  });

  it("lifts scoring when form language dominates", () => {
    const modifiers = deriveNewsPredictionModifiers(
      "Forward available will play starting in form scored brace last match",
    );
    expect(modifiers.scoringRateMultiplier).toBeGreaterThan(1);
    expect(modifiers.confidenceModifier).toBeGreaterThan(0);
  });

  it("builds evidence from match intel fields", () => {
    const evidence = evidenceFromMatchIntel({
      summary: "Tight derby",
      injuries: "Fullback sidelined",
      playerNews: "Winger in form",
      predictionNotes: ["Watch set pieces"],
    });
    expect(evidence).toContain("sidelined");
    expect(evidence).toContain("in form");
  });

  it("merges modifiers without exploding bounds", () => {
    const merged = mergeNewsModifiers(
      deriveNewsPredictionModifiers("injury injured doubtful"),
      deriveNewsPredictionModifiers("available will play in form"),
    );
    expect(merged.scoringRateMultiplier).toBeGreaterThanOrEqual(0.75);
    expect(merged.scoringRateMultiplier).toBeLessThanOrEqual(1.15);
  });
});
