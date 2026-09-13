import { describe, expect, it } from "vitest";
import { eventIntelRequestSchema } from "../src/domain/slate";
import { mergeSlateEvents } from "../src/application/load-watch-slate";
import { slateGameHref } from "../src/features/slate/slate-href";
import { fixtureLabel } from "../src/features/slate/use-slate-game";
import { sportDeskCopy } from "../src/features/desk/sport-desk-copy";
import { formatKickoffEt } from "../src/lib/eastern-time";
import { shouldMuteLiveStream } from "../src/features/analyst/stream-duck";
import {
  classifyScoreboardStatus,
  dedupeSlateEvents,
  isWithinWatchWindow,
  parseRacingEvents,
  parseScoreboardEvents,
  toHttpsLogoUrl,
} from "../src/integrations/sports-scoreboard";
import {
  buildEventIntelQueries,
  classifySlateSport,
  extractIntelSection,
  extractPredictionNotes,
  parseGamesFromResearch,
  parseMixedSlateFromResearch,
} from "../src/integrations/tavily";

const now = Date.parse("2026-09-13T18:00:00.000Z");

describe("watch slate window", () => {
  it("keeps live games and next-24-hour kickoffs", () => {
    expect(
      isWithinWatchWindow("2026-09-13T20:00:00.000Z", "upcoming", now),
    ).toBe(true);
    expect(
      isWithinWatchWindow("2026-09-15T20:00:00.000Z", "upcoming", now),
    ).toBe(false);
    expect(
      isWithinWatchWindow("2026-09-13T16:30:00.000Z", "live", now, "soccer"),
    ).toBe(true);
    expect(
      isWithinWatchWindow("2026-09-12T12:00:00.000Z", "live", now, "soccer"),
    ).toBe(false);
  });

  it("classifies scoreboard status from ESPN state", () => {
    expect(
      classifyScoreboardStatus({ state: "in", startAt: "2026-09-13T17:00:00.000Z", now }),
    ).toBe("live");
    expect(
      classifyScoreboardStatus({
        state: "pre",
        startAt: "2026-09-13T21:00:00.000Z",
        now,
      }),
    ).toBe("upcoming");
    expect(classifyScoreboardStatus({ completed: true, state: "post" })).toBe(
      "final",
    );
  });

  it("parses scoreboard events inside the watch window", () => {
    const events = parseScoreboardEvents(
      {
        leagues: [{ name: "English Premier League" }],
        events: [
          {
            id: "401",
            date: "2026-09-13T19:30:00.000Z",
            competitions: [
              {
                status: { type: { state: "pre", shortDetail: "3:30 PM" } },
                competitors: [
                  {
                    homeAway: "home",
                    team: {
                      displayName: "Arsenal",
                      logos: [{ href: "http://cdn.example.com/arsenal.png" }],
                    },
                  },
                  {
                    homeAway: "away",
                    team: { displayName: "Chelsea" },
                  },
                ],
              },
            ],
          },
        ],
      },
      "soccer",
      now,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      competition: "English Premier League",
      status: "upcoming",
      home: {
        name: "Arsenal",
        logoUrl: "https://cdn.example.com/arsenal.png",
      },
      away: { name: "Chelsea" },
    });
  });
});

describe("tavily slate parsing", () => {
  it("extracts fixtures and prediction notes from research copy", () => {
    const events = parseGamesFromResearch({
      sport: "soccer",
      answer: "Chelsea vs Arsenal live Premier League injury update.",
      results: [],
      now,
    });
    expect(events[0]).toMatchObject({
      away: { name: "Chelsea" },
      home: { name: "Arsenal" },
      status: "live",
      source: "tavily",
    });
    expect(
      extractPredictionNotes("Injury doubt and starting XI rotation tonight"),
    ).toEqual([
      "Availability or injury news may change attempt or scoring probability.",
      "Squad rotation can change the live treasury scenario.",
    ]);
  });

  it("classifies mixed-sport research lines without leaking soccer into NFL", () => {
    expect(classifySlateSport("NBA playoff preview")).toBe("basketball");
    expect(classifySlateSport("UFC fight card tonight")).toBe("mma");
    const mixed = parseMixedSlateFromResearch({
      answer:
        "Arsenal vs Chelsea Premier League live. Lakers vs Celtics NBA tonight. Chiefs vs Bills NFL preview.",
      results: [
        {
          title: "Arsenal vs Chelsea live",
          url: "https://example.com/epl",
          content: "Premier League injury news",
        },
        {
          title: "Chiefs vs Bills preview",
          url: "https://example.com/nfl",
          content: "NFL AFC championship notes",
        },
      ],
      now,
    });
    expect(
      mixed.find((event) => event.away.name === "Arsenal")?.sport,
    ).toBe("soccer");
    expect(
      mixed.find((event) => event.away.name === "Chiefs")?.sport,
    ).toBe("american_football");
    expect(
      mixed.some(
        (event) =>
          event.sport === "american_football" &&
          /arsenal|chelsea/i.test(`${event.home.name} ${event.away.name}`),
      ),
    ).toBe(false);
  });

  it("keeps scoreboard soccer fixtures out of the football filter", () => {
    const scoreboard = parseScoreboardEvents(
      {
        leagues: [{ name: "English Premier League" }],
        events: [
          {
            id: "401",
            date: "2026-09-13T19:30:00.000Z",
            competitions: [
              {
                status: { type: { state: "in", shortDetail: "32'" } },
                competitors: [
                  {
                    homeAway: "home",
                    team: {
                      displayName: "Arsenal",
                      logo: "https://cdn.example.com/arsenal.png",
                    },
                  },
                  {
                    homeAway: "away",
                    team: {
                      displayName: "Chelsea",
                      logo: "https://cdn.example.com/chelsea.png",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      "soccer",
      now,
    );
    const merged = mergeSlateEvents(scoreboard, [
      {
        id: "tavily:american_football:Arsenal-Chelsea",
        sport: "american_football",
        competition: "american football",
        status: "live",
        startAt: "2026-09-13T19:30:00.000Z",
        detail: "Arsenal vs Chelsea live",
        home: { name: "Chelsea" },
        away: { name: "Arsenal" },
        source: "tavily",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sport).toBe("soccer");
    expect(merged[0].home.logoUrl).toBe("https://cdn.example.com/arsenal.png");
    expect(
      mergeSlateEvents([], [
        {
          id: "tavily:soccer:Sunderland-Arsenal",
          sport: "soccer",
          competition: "soccer",
          status: "upcoming",
          startAt: "2026-09-13T19:30:00.000Z",
          detail: "Sunderland vs Arsenal preview",
          home: { name: "Arsenal" },
          away: { name: "Sunderland" },
          source: "tavily",
        },
      ])[0].away.logoUrl,
    ).toBe("https://a.espncdn.com/i/teamlogos/soccer/500/366.png");
  });

  it("ducks live stream audio while the analyst is speaking or awaiting a reply", () => {
    expect(
      shouldMuteLiveStream({
        conversationStatus: "connected",
        agentSpeaking: false,
      }),
    ).toBe(false);
    expect(
      shouldMuteLiveStream({
        conversationStatus: "connected",
        agentSpeaking: true,
      }),
    ).toBe(true);
    expect(
      shouldMuteLiveStream({
        conversationStatus: "connected",
        agentSpeaking: false,
        awaitingOperatorReply: true,
      }),
    ).toBe(true);
    expect(
      shouldMuteLiveStream({
        conversationStatus: "connecting",
        agentSpeaking: false,
      }),
    ).toBe(true);
    expect(
      shouldMuteLiveStream({
        conversationStatus: "disconnected",
        agentSpeaking: true,
      }),
    ).toBe(true);
    expect(
      shouldMuteLiveStream({
        conversationStatus: "disconnected",
        agentSpeaking: false,
      }),
    ).toBe(false);
    expect(toHttpsLogoUrl("http://cdn.example.com/x.png")).toBe(
      "https://cdn.example.com/x.png",
    );
    expect(slateGameHref("espn:soccer:401")).toBe(
      "/?game=espn%3Asoccer%3A401",
    );
    expect(
      fixtureLabel({
        away: { name: "Sunderland" },
        home: { name: "Arsenal" },
      }),
    ).toBe("Sunderland vs Arsenal");
    expect(
      fixtureLabel({
        headline: "Tag Heuer Spanish GP",
        away: { name: "Lando Norris" },
        home: { name: "Kimi Antonelli" },
      }),
    ).toBe("Tag Heuer Spanish GP");
    expect(formatKickoffEt("2026-09-13T13:00:00.000Z")).toMatch(/9:00\s*AM\s*EDT/i);
    expect(sportDeskCopy("motorsport").triggerVerb).toBe("overtake");
    expect(sportDeskCopy("basketball").attemptLabel).toBe("Attempt probability");
    expect(sportDeskCopy("soccer").defaultAction).toBe("Shot On Goal");
  });

  it("parses Formula 1 races without home and away teams", () => {
    const races = parseRacingEvents(
      {
        events: [
          {
            id: "600057443",
            date: "2026-09-13T13:00:00.000Z",
            name: "Tag Heuer Spanish Grand Prix",
            shortName: "Tag Heuer Spanish GP",
            fullStatus: {
              type: {
                state: "pre",
                completed: false,
                shortDetail: "9/13 - 9:00 AM EDT",
              },
            },
            competitors: [
              { displayName: "Lando Norris", logo: "https://cdn.example.com/gbr.png" },
              { displayName: "Kimi Antonelli" },
            ],
          },
        ],
      },
      now,
    );
    expect(races[0]).toMatchObject({
      sport: "motorsport",
      status: "upcoming",
      headline: "Tag Heuer Spanish GP",
      away: { name: "Lando Norris" },
      home: { name: "Kimi Antonelli" },
    });
    expect(
      dedupeSlateEvents([
        {
          id: "espn:motorsport:600057443",
          sport: "motorsport",
          competition: "Formula 1",
          status: "final",
          startAt: "2026-09-11T11:30:00.000Z",
          detail: "Final",
          headline: "Tag Heuer Spanish GP",
          home: { name: "Kimi Antonelli" },
          away: { name: "George Russell" },
          source: "scoreboard",
        },
        races[0],
      ])[0].status,
    ).toBe("upcoming");
  });

  it("drops uncorroborated Tavily live leftovers", () => {
    expect(
      mergeSlateEvents([], [
        {
          id: "tavily:soccer:Sunderland-Arsenal",
          sport: "soccer",
          competition: "soccer",
          status: "live",
          startAt: "2026-09-13T19:30:00.000Z",
          detail: "Sunderland vs Arsenal live",
          home: { name: "Arsenal" },
          away: { name: "Sunderland" },
          source: "tavily",
        },
      ]),
    ).toEqual([]);
  });

  it("validates event intel requests", () => {
    expect(() => eventIntelRequestSchema.parse({ id: "1" })).toThrow();
    expect(
      buildEventIntelQueries({
        id: "espn:soccer:1",
        sport: "soccer",
        home: "Arsenal",
        away: "Chelsea",
        competition: "Premier League",
        status: "live",
      }).liveQuery,
    ).toContain("live commentary");
    expect(
      buildEventIntelQueries({
        id: "espn:soccer:1",
        sport: "soccer",
        home: "Arsenal",
        away: "Chelsea",
        competition: "Premier League",
        status: "live",
      }).injuryQuery,
    ).toContain("injury report");
  });

  it("keeps lineup and injury excerpts distinct", () => {
    const sources = [
      {
        title: "Confirmed XI",
        url: "https://example.com/lineup",
        summary: "Arsenal starting XI: Raya; White, Saliba, Gabriel, Lewis-Skelly.",
      },
      {
        title: "Injury desk",
        url: "https://example.com/injuries",
        summary: "Saka remains doubtful with a hamstring injury and may be sidelined.",
      },
    ];
    expect(
      extractIntelSection(
        "Arsenal starting XI includes Saliba. Saka is doubtful with a hamstring injury.",
        sources,
        ["lineup", "starting xi", "squad", "xi"],
        "No squad",
      ),
    ).toMatch(/starting XI/i);
    expect(
      extractIntelSection(
        "Arsenal starting XI includes Saliba. Saka is doubtful with a hamstring injury.",
        sources,
        ["injury", "injured", "doubtful", "sidelined"],
        "No injury",
      ),
    ).toMatch(/doubtful|hamstring|sidelined/i);
  });
});
