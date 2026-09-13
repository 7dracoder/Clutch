import { z } from "zod";
import { deriveNewsPredictionModifiers } from "@/domain/news-modifiers";
import type {
  EventIntel,
  EventIntelRequest,
  SlateEvent,
  SlateSport,
} from "@/domain/slate";
import type { PlayerContext, ResearchSource } from "@/domain/types";
import { fetchLiveSoccerPulse } from "@/integrations/api-football";
import { inferMatchHints } from "@/integrations/match-hints";
import { inferEventSport } from "@/integrations/sport-identity";
import { isWithinWatchWindow } from "@/integrations/sports-scoreboard";

export { classifySlateSport } from "@/integrations/sport-identity";

export { inferMatchHints };

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface ResearchImage {
  url: string;
  description: string;
}

export interface MatchContext {
  query: string;
  summary: string;
  sources: ResearchSource[];
  images: ResearchImage[];
}

export const matchResearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(300),
  team: z.string().trim().min(1).max(80).optional(),
  competition: z.string().trim().min(1).max(80).optional(),
});

export type MatchResearchRequest = z.infer<typeof matchResearchRequestSchema>;

const trackingPixelPattern =
  /1x1|pixel\.gif|spacer\.gif|transparent\.gif|tracking(\.|-)|facebook\.com\/tr|google-analytics|doubleclick|adservice|adsystem|pixel\.png|analytics/i;

export function buildMatchContextQueries(input: MatchResearchRequest) {
  const subject = [input.team, input.competition].filter(Boolean).join(" ");
  const contextQuery = [
    input.query,
    subject,
    "match preview injuries availability lineup",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const logoSubject = subject || input.query;
  const logoQuery = `${logoSubject} official club competition logo`.replace(
    /\s+/g,
    " ",
  );
  return { contextQuery, logoQuery };
}

export function filterResearchImages(
  images: Array<string | { url?: string; description?: string } | null>,
): ResearchImage[] {
  const seen = new Set<string>();
  const filtered: ResearchImage[] = [];

  for (const image of images) {
    const url = typeof image === "string" ? image : image?.url;
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") continue;
      if (trackingPixelPattern.test(url)) continue;
      if (seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      filtered.push({
        url: parsed.href,
        description:
          (typeof image === "object" && image?.description?.trim()) ||
          "Match or competition image",
      });
    } catch {
      continue;
    }
    if (filtered.length >= 8) break;
  }

  return filtered;
}

export function buildEventIntelQueries(input: EventIntelRequest) {
  const fixture = `${input.away} vs ${input.home} ${input.competition ?? ""} ${input.sport}`.replace(
    /\s+/g,
    " ",
  );
  if (input.sport === "motorsport") {
    const race = `${input.home} ${input.away} ${input.competition ?? "Formula 1"}`.replace(
      /\s+/g,
      " ",
    );
    return {
      previewQuery: `${race} starting grid qualifying pole race preview`,
      injuryQuery: `${race} driver fitness penalty gearbox engine change availability`,
      liveQuery: `${race} live race commentary lap leader pit stop safety car`,
    };
  }
  return {
    previewQuery: `${fixture} confirmed lineup starting XI squad rotation`,
    injuryQuery: `${fixture} injury report availability doubtful sidelined ruled out suspended`,
    liveQuery: `${fixture} live commentary minute by minute goal red card latest score updates`,
  };
}

const teamNamePattern =
  "[A-Za-z][\\w.'-]{0,20}(?:\\s+[A-Za-z][\\w.'-]{0,20}){0,2}";
const versusPattern = new RegExp(
  `(${teamNamePattern})\\s+(?:vs\\.?|v\\.?|versus)\\s+(${teamNamePattern})(?=\\s|$|[,.:;]|live|tonight|today|tomorrow|preview|injury|result|score)`,
  "i",
);

function cleanTeamName(value: string) {
  return value
    .replace(
      /\b(live|tonight|today|tomorrow|preview|injury|update|latest|result|score|final|lineups?|will)\b.*$/i,
      "",
    )
    .trim();
}

function hasNearTermTiming(text: string) {
  return /\btoday\b|\btonight\b|\btomorrow\b|\bthis weekend\b|\bkickoff\b|\bsunday\b|\bmonday\b|\blive\b/i.test(
    text,
  );
}

export function parseGamesFromResearch(input: {
  sport: SlateSport;
  answer?: string;
  results: Array<{ title: string; url: string; content: string }>;
  now?: number;
}): SlateEvent[] {
  const now = input.now ?? Date.now();
  const seen = new Set<string>();
  const events: SlateEvent[] = [];
  const lines = [
    input.answer ?? "",
    ...input.results.map((result) => `${result.title}. ${result.content}`),
  ]
    .join("\n")
    .split(/\n|(?<=\.)\s+/);

  for (const line of lines) {
    const match = line.match(versusPattern);
    if (!match) continue;
    const away = cleanTeamName(match[1]);
    const home = cleanTeamName(match[2]);
    if (!away || !home) continue;
    const key = `${input.sport}:${away.toLowerCase()}:${home.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const haystack = line.toLowerCase();
    const status: SlateEvent["status"] = /\blive\b|\bht\b|\b[0-9]+'/.test(
      haystack,
    )
      ? "live"
      : /\bft\b|\bfinal\b|\bfull[- ]time\b/.test(haystack)
        ? "final"
        : "upcoming";
    const startAt = new Date(now + 60 * 60 * 1000).toISOString();
    if (
      status === "upcoming" &&
      !hasNearTermTiming(line) &&
      !/\bpreview\b/i.test(line)
    ) {
      continue;
    }
    if (!isWithinWatchWindow(startAt, status, now, input.sport)) {
      continue;
    }
    events.push({
      id: `tavily:${input.sport}:${away}-${home}`.replace(/\s+/g, "-"),
      sport: input.sport,
      competition: input.sport.replaceAll("_", " "),
      status,
      startAt,
      detail: line.slice(0, 140),
      home: { name: home },
      away: { name: away },
      source: "tavily",
    });
    if (events.length >= 8) break;
  }

  return events;
}

export function extractPredictionNotes(text: string) {
  const lower = text.toLowerCase();
  const notes: string[] = [];
  if (/\binjur|\bdoubtful|\bquestionable|\bout for\b|\bsuspend/.test(lower)) {
    notes.push("Availability or injury news may change attempt or scoring probability.");
  }
  if (/\blineup|\bstarting xi|\brotation|\brested\b/.test(lower)) {
    notes.push("Squad rotation can change the live treasury scenario.");
  }
  if (/\brainstorm|\bweather|\bpostpon|\bdelay\b/.test(lower)) {
    notes.push("Schedule or conditions may delay kickoff and pending cash timing.");
  }
  if (/\bform\b|\bsuspension|\bred card|\bminutes restriction/.test(lower)) {
    notes.push("Player discipline or minutes limits can move prediction confidence.");
  }
  return notes.slice(0, 4);
}

async function tavilySearch(input: {
  query: string;
  includeImages?: boolean;
  topic?: "general" | "news";
  days?: number;
  maxResults?: number;
}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not configured");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: input.query,
      topic: input.topic ?? "news",
      search_depth: "advanced",
      max_results: input.maxResults ?? 5,
      days: input.days,
      include_answer: true,
      include_images: input.includeImages ?? false,
      include_image_descriptions: input.includeImages ?? false,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Tavily request failed with status ${response.status}`);
  }

  return (await response.json()) as {
    answer?: string;
    results?: TavilyResult[];
    images?: Array<string | { url?: string; description?: string }>;
  };
}

function toSources(results: TavilyResult[] | undefined): ResearchSource[] {
  return (results ?? []).map((result) => ({
    title: result.title,
    url: result.url,
    summary: result.content,
    score: result.score,
  }));
}

export async function researchPlayerContext(input: {
  playerName: string;
  team: string;
}): Promise<PlayerContext> {
  const query = `${input.playerName} ${input.team} latest injury status lineup minutes restriction form`;
  const payload = await tavilySearch({ query, topic: "news" });
  const sources = toSources(payload.results);
  const evidence = `${payload.answer ?? ""} ${sources
    .map((source) => source.summary)
    .join(" ")}`;
  const modifiers = deriveNewsPredictionModifiers(evidence);

  return {
    query,
    confidenceModifier: modifiers.confidenceModifier,
    scoringRateMultiplier: modifiers.scoringRateMultiplier,
    attemptMultiplier: modifiers.attemptMultiplier,
    notes: modifiers.notes,
    summary:
      payload.answer ??
      sources[0]?.summary ??
      "No current player context was returned.",
    sources,
  };
}

export async function researchMatchContext(
  input: MatchResearchRequest,
): Promise<MatchContext> {
  const { contextQuery, logoQuery } = buildMatchContextQueries(input);
  const [context, logos] = await Promise.all([
    tavilySearch({
      query: contextQuery,
      includeImages: true,
      topic: "news",
    }),
    tavilySearch({
      query: logoQuery,
      includeImages: true,
      topic: "general",
    }),
  ]);

  const sources = [
    ...toSources(context.results),
    ...toSources(logos.results),
  ].filter(
    (source, index, all) =>
      all.findIndex((candidate) => candidate.url === source.url) === index,
  );
  const images = filterResearchImages([
    ...(context.images ?? []),
    ...(logos.images ?? []),
  ]);

  return {
    query: contextQuery,
    summary:
      context.answer ??
      sources[0]?.summary ??
      "No current match context was returned.",
    sources,
    images,
  };
}

export const SLATE_DIGEST_QUERY =
  "today tomorrow next 24 hours live scores fixtures Premier League LaLiga Champions League NBA NFL UFC Formula 1 ATP MLB NHL";

export function parseMixedSlateFromResearch(input: {
  answer?: string;
  results: Array<{ title: string; url: string; content: string }>;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const seen = new Set<string>();
  const events: SlateEvent[] = [];

  const consider = (line: string, chunk: string) => {
    const grandPrix = line.match(
      /((?:[A-Z][\w.-]+\s+){0,4}(?:Grand Prix|GP))/i,
    );
    if (
      grandPrix &&
      /formula\s*1|\bf1\b|grand prix/i.test(`${line} ${chunk}`) &&
      hasNearTermTiming(`${line} ${chunk}`)
    ) {
      const headline = grandPrix[1].replace(/\s+/g, " ").trim();
      const key = `motorsport:${headline.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        events.push({
          id: `tavily:motorsport:${headline}`.replace(/\s+/g, "-"),
          sport: "motorsport",
          competition: "Formula 1",
          status: /\blive\b|\blap\b/i.test(line) ? "live" : "upcoming",
          startAt: new Date(now + 60 * 60 * 1000).toISOString(),
          detail: line.slice(0, 140),
          headline,
          home: { name: headline },
          away: { name: "Formula 1" },
          source: "tavily",
        });
      }
    }
    const match = line.match(versusPattern);
    if (!match) return;
    const away = cleanTeamName(match[1]);
    const home = cleanTeamName(match[2]);
    if (!away || !home) return;
    const sport = inferEventSport({ home, away, line, chunk });
    if (!sport) return;
    const key = `${sport}:${away.toLowerCase()}:${home.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const parsed = parseGamesFromResearch({
      sport,
      answer: line,
      results: [],
      now,
    })[0];
    if (parsed) events.push(parsed);
  };

  for (const result of input.results) {
    const chunk = `${result.title}. ${result.content}`;
    for (const line of chunk.split(/\n|(?<=\.)\s+/)) {
      consider(line, chunk);
      if (events.length >= 12) return events;
    }
  }
  if (input.answer) {
    for (const line of input.answer.split(/\n|(?<=\.)\s+/)) {
      consider(line, line);
      if (events.length >= 12) return events;
    }
  }

  return events;
}

export async function researchUpcomingSlate(now = Date.now()) {
  const payload = await tavilySearch({
    query: SLATE_DIGEST_QUERY,
    topic: "news",
    days: 1,
    maxResults: 8,
    includeImages: true,
  });
  return parseMixedSlateFromResearch({
    answer: payload.answer,
    results: (payload.results ?? []).map((result) => ({
      title: result.title,
      url: result.url,
      content: result.content,
    })),
    now,
  });
}

function termHits(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.reduce((count, term) => {
    const needle = term.toLowerCase();
    if (needle.includes(" ")) {
      return count + (lower.includes(needle) ? 1 : 0);
    }
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return count + (new RegExp(`\\b${escaped}\\b`).test(lower) ? 1 : 0);
  }, 0);
}

export function extractIntelSection(
  answer: string | undefined,
  sources: ResearchSource[],
  terms: string[],
  fallback: string,
) {
  const chunks = [answer ?? "", ...sources.map((source) => `${source.title}. ${source.summary}`)]
    .flatMap((text) =>
      text
        .split(/(?<=[.!?])\s+|\n+/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 12),
    )
    .map((chunk) => ({ chunk, hits: termHits(chunk, terms) }))
    .filter((item) => item.hits > 0)
    .sort((left, right) => right.hits - left.hits || right.chunk.length - left.chunk.length);

  if (!chunks.length) return fallback;

  const picked: string[] = [];
  let used = 0;
  for (const { chunk } of chunks) {
    if (picked.includes(chunk)) continue;
    if (used + chunk.length > 480 && picked.length) break;
    picked.push(chunk);
    used += chunk.length + 1;
    if (picked.length >= 3) break;
  }
  return picked.join(" ");
}

const PREVIEW_WALL =
  /scheduled for|starting xi|lineup includes|head-to-head|league points|recent form|injury report|confirmed lineup/i;

function clipLiveBeat(raw: string, max = 260): string | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (PREVIEW_WALL.test(cleaned)) {
    const firstBeat = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
    if (
      firstBeat.length <= max &&
      firstBeat.length >= 24 &&
      !PREVIEW_WALL.test(firstBeat)
    ) {
      return firstBeat;
    }
    return null;
  }
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

/** Prefer a short live pulse from Tavily answer/results; skip preview walls. */
export function pickTavilyLiveCommentary(live?: {
  answer?: string;
  results?: Array<{ content?: string; title?: string }>;
} | null): string | null {
  if (!live) return null;
  const candidates = [
    live.answer,
    ...(live.results ?? []).flatMap((result) => [
      result.content,
      result.title,
    ]),
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    const beat = clipLiveBeat(candidate);
    if (beat) return beat;
  }
  return null;
}

export async function researchEventIntel(
  input: EventIntelRequest,
): Promise<EventIntel> {
  const { previewQuery, injuryQuery, liveQuery } = buildEventIntelQueries(input);

  // Live commentary always comes from Tavily. API-Football (when available)
  // only supplies structured liveScore for soccer.
  let livePulse: Awaited<ReturnType<typeof fetchLiveSoccerPulse>> = null;
  if (input.status === "live" && input.sport === "soccer") {
    try {
      livePulse = await fetchLiveSoccerPulse({
        home: input.home,
        away: input.away,
      });
    } catch {
      livePulse = null;
    }
  }

  const searches = [
    tavilySearch({
      query: previewQuery,
      topic: "news",
      days: 3,
      maxResults: 6,
      includeImages: true,
    }),
    tavilySearch({
      query: injuryQuery,
      topic: "news",
      days: 7,
      maxResults: 5,
    }),
    tavilySearch({
      query: `${input.home} ${input.away} ${input.competition ?? input.sport} official team club logo`,
      topic: "general",
      maxResults: 4,
      includeImages: true,
    }),
  ];
  if (input.status === "live") {
    searches.push(
      tavilySearch({
        query: liveQuery,
        topic: "news",
        days: 1,
        maxResults: 6,
        includeImages: true,
      }),
    );
  }

  const [preview, injury, logos, live] = await Promise.all(searches);
  const sources = [
    ...toSources(preview.results),
    ...toSources(injury.results),
    ...toSources(live?.results),
    ...(livePulse
      ? [
          {
            title: "API-Football live score",
            url: "https://www.api-football.com",
            summary: livePulse.scoreline,
          } satisfies ResearchSource,
        ]
      : []),
  ].filter(
    (source, index, all) =>
      all.findIndex((candidate) => candidate.url === source.url) === index,
  );
  const combined = [preview.answer, injury.answer, live?.answer]
    .filter(Boolean)
    .join(" ");
  const summary =
    preview.answer ??
    injury.answer ??
    livePulse?.scoreline ??
    sources[0]?.summary ??
    "No current event research was returned.";
  const tavilyCommentary = pickTavilyLiveCommentary(live);

  return {
    query: previewQuery,
    summary,
    lineup: extractIntelSection(
      preview.answer,
      sources,
      ["lineup", "starting xi", "starting 11", "squad", "xi"],
      "No confirmed squad update yet.",
    ),
    injuries: extractIntelSection(
      injury.answer ?? preview.answer,
      sources,
      ["injury", "injured", "injuries", "doubtful", "questionable", "sidelined", "ruled out", "availability"],
      "No injury or availability headline yet.",
    ),
    playerNews: extractIntelSection(
      preview.answer,
      sources,
      ["suspend", "form", "minutes", "return", "ruled", "transfer"],
      "No player-specific news beyond the match preview.",
    ),
    commentary:
      input.status === "live"
        ? (tavilyCommentary ??
          livePulse?.commentary ??
          "Waiting for live commentary.")
        : "Commentary starts when the event goes live.",
    liveScore: livePulse
      ? {
          home: livePulse.homeScore,
          away: livePulse.awayScore,
          detail: livePulse.minuteLabel,
          source: "api_football",
        }
      : undefined,
    predictionNotes: extractPredictionNotes(`${combined} ${summary}`),
    sources,
    images: filterResearchImages([
      ...(preview.images ?? []),
      ...(logos.images ?? []),
      ...(live?.images ?? []),
    ]),
    fetchedAt: new Date().toISOString(),
  };
}
