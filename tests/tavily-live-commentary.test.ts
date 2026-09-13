import { describe, expect, it } from "vitest";
import { pickTavilyLiveCommentary } from "../src/integrations/tavily";

describe("pickTavilyLiveCommentary", () => {
  it("prefers a short Tavily answer", () => {
    expect(
      pickTavilyLiveCommentary({
        answer: "Minute 67: Away side scores from a corner. Home chasing an equalizer.",
      }),
    ).toContain("Minute 67");
  });

  it("skips preview walls and uses a live result snippet", () => {
    const picked = pickTavilyLiveCommentary({
      answer:
        "The match is scheduled for tonight. Starting XI includes several rotation players and recent form has been mixed across the league points table.",
      results: [
        {
          title: "Live blog",
          content: "78' Red card for the home midfielder after a late challenge.",
        },
      ],
    });
    expect(picked).toMatch(/Red card/i);
  });

  it("returns null when nothing usable is present", () => {
    expect(pickTavilyLiveCommentary({ answer: "", results: [] })).toBeNull();
    expect(pickTavilyLiveCommentary(null)).toBeNull();
  });
});
