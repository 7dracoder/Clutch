import type { SlateEvent, SlateSport } from "@/domain/slate";

const SCOREBOARD_FEEDS: Array<{
  sport: SlateSport;
  path: string;
}> = [
  { sport: "soccer", path: "soccer/eng.1" },
  { sport: "soccer", path: "soccer/esp.1" },
  { sport: "soccer", path: "soccer/ger.1" },
  { sport: "soccer", path: "soccer/ita.1" },
  { sport: "soccer", path: "soccer/fra.1" },
  { sport: "soccer", path: "soccer/usa.1" },
  { sport: "soccer", path: "soccer/uefa.champions" },
  { sport: "basketball", path: "basketball/nba" },
  { sport: "basketball", path: "basketball/wnba" },
  { sport: "american_football", path: "football/nfl" },
  { sport: "american_football", path: "football/college-football" },
  { sport: "tennis", path: "tennis/atp" },
  { sport: "tennis", path: "tennis/wta" },
  { sport: "mma", path: "mma/ufc" },
  { sport: "motorsport", path: "racing/f1" },
  { sport: "baseball", path: "baseball/mlb" },
  { sport: "hockey", path: "hockey/nhl" },
];

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_LIMIT_MS: Record<SlateSport, number> = {
  soccer: 3.5 * 60 * 60 * 1000,
  basketball: 3.5 * 60 * 60 * 1000,
  american_football: 4.5 * 60 * 60 * 1000,
  tennis: 6 * 60 * 60 * 1000,
  mma: 6 * 60 * 60 * 1000,
  motorsport: 4 * 60 * 60 * 1000,
  baseball: 4.5 * 60 * 60 * 1000,
  hockey: 4 * 60 * 60 * 1000,
};

interface EspnCompetitor {
  homeAway?: string;
  score?: string;
  athlete?: {
    displayName?: string;
    shortName?: string;
    flag?: { href?: string };
  };
  team?: {
    id?: string;
    displayName?: string;
    abbreviation?: string;
    logo?: string;
    logos?: Array<{ href?: string }>;
  };
}

interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  competitions?: Array<{
    venue?: { fullName?: string };
    status?: {
      type?: {
        state?: string;
        completed?: boolean;
        detail?: string;
        shortDetail?: string;
      };
    };
    competitors?: EspnCompetitor[];
  }>;
}

interface EspnBoard {
  leagues?: Array<{ name?: string }>;
  events?: EspnEvent[];
}

export function formatScoreboardDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function isStaleLive(
  startAt: string,
  sport: SlateSport,
  now = Date.now(),
) {
  const start = Date.parse(startAt);
  if (Number.isNaN(start)) return false;
  return now - start > LIVE_LIMIT_MS[sport];
}

export function isWithinWatchWindow(
  startAt: string,
  status: SlateEvent["status"],
  now = Date.now(),
  sport: SlateSport = "soccer",
) {
  const start = Date.parse(startAt);
  if (Number.isNaN(start)) return status === "live";
  if (status === "live") return !isStaleLive(startAt, sport, now);
  if (status === "final") return now - start <= FOUR_HOURS_MS;
  return start >= now - 8 * 60 * 60 * 1000 && start <= now + DAY_MS;
}

export function classifyScoreboardStatus(input: {
  state?: string;
  completed?: boolean;
  startAt?: string;
  now?: number;
}): SlateEvent["status"] {
  if (input.completed || input.state === "post") return "final";
  if (input.state === "in") return "live";
  const start = input.startAt ? Date.parse(input.startAt) : Number.NaN;
  const now = input.now ?? Date.now();
  if (!Number.isNaN(start) && start <= now && input.state !== "pre") {
    return "live";
  }
  return "upcoming";
}

export function toHttpsLogoUrl(url?: string | null) {
  if (!url) return undefined;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http://")) return `https://${url.slice("http://".length)}`;
  if (url.startsWith("https://")) return url;
  return undefined;
}

const soccerLogoIds: Record<string, string> = {
  arsenal: "359",
  chelsea: "363",
  sunderland: "366",
  liverpool: "364",
  "manchester city": "382",
  "manchester united": "360",
  tottenham: "367",
  newcastle: "361",
  "aston villa": "362",
  "west ham": "371",
  brighton: "331",
  "crystal palace": "384",
  everton: "368",
  fulham: "370",
  brentford: "337",
  "nottingham forest": "393",
  "real madrid": "86",
  barcelona: "83",
  "atletico madrid": "1068",
  bayern: "132",
};

function espnLogoFallback(
  sport: SlateSport,
  team?: { id?: string; abbreviation?: string; displayName?: string },
) {
  if (sport === "soccer") {
    const named = team?.displayName?.toLowerCase() ?? "";
    const mappedId =
      team?.id ??
      Object.entries(soccerLogoIds).find(([name]) => named.includes(name))?.[1];
    if (mappedId) {
      return `https://a.espncdn.com/i/teamlogos/soccer/500/${mappedId}.png`;
    }
  }
  const slug = team?.abbreviation?.toLowerCase();
  if (!slug) return undefined;
  const folder =
    sport === "basketball"
      ? "nba"
      : sport === "american_football"
        ? "nfl"
        : sport === "baseball"
          ? "mlb"
          : sport === "hockey"
            ? "nhl"
            : null;
  return folder
    ? `https://a.espncdn.com/i/teamlogos/${folder}/500/${slug}.png`
    : undefined;
}

function competitorFrom(
  item: EspnCompetitor | undefined,
  fallback: string,
  sport: SlateSport,
) {
  const logo =
    item?.team?.logo ??
    item?.team?.logos?.[0]?.href ??
    item?.athlete?.flag?.href ??
    espnLogoFallback(sport, item?.team);
  return {
    name:
      item?.team?.displayName ??
      item?.athlete?.displayName ??
      item?.athlete?.shortName ??
      fallback,
    abbreviation: item?.team?.abbreviation,
    logoUrl: toHttpsLogoUrl(logo),
    score: item?.score,
  };
}

export function logoUrlForTeam(sport: SlateSport, name: string) {
  return espnLogoFallback(sport, { displayName: name });
}

export function backfillSlateLogos(events: SlateEvent[]) {
  const logos = new Map<string, string>();
  for (const event of events) {
    for (const side of [event.home, event.away]) {
      const logo =
        side.logoUrl ?? logoUrlForTeam(event.sport, side.name);
      if (logo) logos.set(side.name.toLowerCase(), logo);
    }
  }
  return events.map((event) => ({
    ...event,
    home: {
      ...event.home,
      logoUrl:
        event.home.logoUrl ??
        logos.get(event.home.name.toLowerCase()) ??
        logoUrlForTeam(event.sport, event.home.name),
    },
    away: {
      ...event.away,
      logoUrl:
        event.away.logoUrl ??
        logos.get(event.away.name.toLowerCase()) ??
        logoUrlForTeam(event.sport, event.away.name),
    },
  }));
}

export function parseScoreboardEvents(
  payload: unknown,
  sport: SlateSport,
  now = Date.now(),
): SlateEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const board = payload as EspnBoard;
  const competition = board.leagues?.[0]?.name ?? sport.replaceAll("_", " ");

  return (board.events ?? []).flatMap((event) => {
    const competitionInfo = event.competitions?.[0];
    const startAt = event.date;
    if (!event.id || !startAt) return [];
    const home = competitionInfo?.competitors?.find(
      (item) => item.homeAway === "home",
    );
    const away = competitionInfo?.competitors?.find(
      (item) => item.homeAway === "away",
    );
    const first = competitionInfo?.competitors?.[0];
    const second = competitionInfo?.competitors?.[1];
    const homeCompetitor = competitorFrom(
      home ?? second,
      second?.team?.displayName ?? event.name?.split(" vs ")[1] ?? "",
      sport,
    );
    const awayCompetitor = competitorFrom(
      away ?? first,
      first?.team?.displayName ?? event.name?.split(" vs ")[0] ?? "",
      sport,
    );
    const status = classifyScoreboardStatus({
      state: competitionInfo?.status?.type?.state,
      completed: competitionInfo?.status?.type?.completed,
      startAt,
      now,
    });
    if (sport === "motorsport") {
      const racing = racingEventFrom(
        {
          id: event.id,
          startAt,
          name: event.name,
          shortName: event.shortName,
          status,
          detail:
            competitionInfo?.status?.type?.shortDetail ??
            competitionInfo?.status?.type?.detail ??
            event.shortName ??
            event.name,
          competitors: (competitionInfo?.competitors ?? []).map((item) => ({
            name:
              item.athlete?.displayName ??
              item.athlete?.shortName ??
              item.team?.displayName,
            logoUrl: toHttpsLogoUrl(
              item.athlete?.flag?.href ??
                item.team?.logo ??
                item.team?.logos?.[0]?.href,
            ),
            score: item.score,
          })),
          venue: competitionInfo?.venue?.fullName,
        },
        now,
      );
      return racing ? [racing] : [];
    }
    if (!homeCompetitor.name || !awayCompetitor.name) return [];
    const resolved = isStaleLive(startAt, sport, now) && status === "live"
      ? "final"
      : status;
    if (!isWithinWatchWindow(startAt, resolved, now, sport)) return [];

    return [
      {
        id: `espn:${sport}:${event.id}`,
        sport,
        competition,
        status: resolved,
        startAt,
        detail:
          competitionInfo?.status?.type?.shortDetail ??
          competitionInfo?.status?.type?.detail ??
          event.shortName ??
          event.name ??
          "Scheduled",
        venue: competitionInfo?.venue?.fullName,
        home: homeCompetitor,
        away: awayCompetitor,
        source: "scoreboard",
      } satisfies SlateEvent,
    ];
  });
}

async function fetchBoard(path: string, dates?: string) {
  const url = new URL(
    `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`,
  );
  if (dates) url.searchParams.set("dates", dates);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ClutchTreasury/0.1",
    },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Scoreboard ${path} failed with status ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

function racingEventFrom(
  input: {
    id: string;
    startAt: string;
    name?: string;
    shortName?: string;
    status: SlateEvent["status"];
    detail?: string;
    competitors: Array<{ name?: string; logoUrl?: string; score?: string }>;
    venue?: string;
  },
  now: number,
): SlateEvent | null {
  const headline = input.shortName ?? input.name;
  if (!headline) return null;
  const drivers = input.competitors.filter((item) => item.name);
  const away = drivers[0];
  const home = drivers[1];
  const status =
    input.status === "live" && isStaleLive(input.startAt, "motorsport", now)
      ? "final"
      : input.status;
  if (!isWithinWatchWindow(input.startAt, status, now, "motorsport")) {
    return null;
  }
  return {
    id: `espn:motorsport:${input.id}`,
    sport: "motorsport",
    competition: "Formula 1",
    status,
    startAt: input.startAt,
    detail: input.detail ?? headline,
    headline,
    venue: input.venue,
    home: {
      name: home?.name ?? headline,
      logoUrl: home?.logoUrl,
      score: home?.score,
    },
    away: {
      name: away?.name ?? "Formula 1",
      logoUrl: away?.logoUrl,
      score: away?.score,
    },
    source: "scoreboard",
  };
}

export function parseRacingEvents(payload: unknown, now = Date.now()): SlateEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const board = payload as {
    events?: Array<{
      id?: string;
      date?: string;
      name?: string;
      shortName?: string;
      fullStatus?: {
        type?: {
          state?: string;
          completed?: boolean;
          detail?: string;
          shortDetail?: string;
        };
      };
      competitors?: Array<{
        displayName?: string;
        shortName?: string;
        logo?: string;
        score?: string;
      }>;
    }>;
  };
  return (board.events ?? []).flatMap((event) => {
    if (!event.id || !event.date) return [];
    const status = classifyScoreboardStatus({
      state: event.fullStatus?.type?.state,
      completed: event.fullStatus?.type?.completed,
      startAt: event.date,
      now,
    });
    const parsed = racingEventFrom(
      {
        id: event.id,
        startAt: event.date,
        name: event.name,
        shortName: event.shortName,
        status,
        detail:
          event.fullStatus?.type?.shortDetail ??
          event.fullStatus?.type?.detail ??
          event.shortName ??
          event.name,
        competitors: (event.competitors ?? []).map((item) => ({
          name: item.displayName ?? item.shortName,
          logoUrl: toHttpsLogoUrl(item.logo),
          score: item.score,
        })),
      },
      now,
    );
    return parsed ? [parsed] : [];
  });
}

export function dedupeSlateEvents(events: SlateEvent[]) {
  const rank = { live: 0, upcoming: 1, final: 2 };
  const byId = new Map<string, SlateEvent>();
  for (const event of events) {
    const current = byId.get(event.id);
    if (!current) {
      byId.set(event.id, event);
      continue;
    }
    const betterStatus = rank[event.status] - rank[current.status];
    if (betterStatus < 0) {
      byId.set(event.id, event);
      continue;
    }
    if (
      betterStatus === 0 &&
      Date.parse(event.startAt) > Date.parse(current.startAt)
    ) {
      byId.set(event.id, event);
    }
  }
  return [...byId.values()];
}

export function sortSlateEvents(events: SlateEvent[]) {
  const rank = { live: 0, upcoming: 1, final: 2 };
  return [...events].sort((left, right) => {
    const statusDelta = rank[left.status] - rank[right.status];
    if (statusDelta !== 0) return statusDelta;
    return Date.parse(left.startAt) - Date.parse(right.startAt);
  });
}

export async function fetchWatchSlate(now = new Date()) {
  const today = formatScoreboardDate(now);
  const tomorrow = formatScoreboardDate(new Date(now.getTime() + DAY_MS));
  const [results, racing] = await Promise.all([
    Promise.allSettled(
      SCOREBOARD_FEEDS.flatMap((feed) => [
        fetchBoard(feed.path, today).then((payload) =>
          parseScoreboardEvents(payload, feed.sport, now.getTime()),
        ),
        fetchBoard(feed.path, tomorrow).then((payload) =>
          parseScoreboardEvents(payload, feed.sport, now.getTime()),
        ),
      ]),
    ),
    fetchJson(
      "https://site.api.espn.com/apis/site/v2/sports/racing/f1/events",
    )
      .then((payload) => parseRacingEvents(payload, now.getTime()))
      .catch(() => [] as SlateEvent[]),
  ]);

  const events = sortSlateEvents(
    dedupeSlateEvents([
      ...results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      ),
      ...racing,
    ]),
  );

  return events.slice(0, 48);
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ClutchTreasury/0.1",
    },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Scoreboard ${url} failed with status ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}
