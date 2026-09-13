import { namesReferToSameTeam } from "@/integrations/sport-identity";
import { TtlCache } from "@/lib/ttl-cache";

const API_FOOTBALL_BASE =
  process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";

export interface ApiFootballFixture {
  fixture: {
    id: number;
    status: {
      long?: string;
      short?: string;
      elapsed?: number | null;
      extra?: number | null;
    };
  };
  league: { name?: string };
  teams: {
    home: { name?: string };
    away: { name?: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

export interface ApiFootballEvent {
  time?: { elapsed?: number | null; extra?: number | null };
  team?: { name?: string };
  player?: { name?: string | null };
  assist?: { name?: string | null };
  type?: string;
  detail?: string;
}

export interface LiveMatchPulse {
  matchId: string;
  homeScore: string;
  awayScore: string;
  minuteLabel: string;
  scoreline: string;
  commentary: string;
  source: "api_football";
}

const livescoreCache = new TtlCache<ApiFootballFixture[]>(20_000);
const eventsCache = new TtlCache<ApiFootballEvent[]>(20_000);

function apiKey() {
  const key =
    process.env.API_FOOTBALL_KEY?.trim() ||
    process.env.ISPORTS_API_KEY?.trim();
  if (!key) {
    throw new Error("API_FOOTBALL_KEY is not configured");
  }
  return key;
}

function isConfigured() {
  return Boolean(
    process.env.API_FOOTBALL_KEY?.trim() ||
      process.env.ISPORTS_API_KEY?.trim(),
  );
}

async function apiFootballGet<T>(
  path: string,
  params: Record<string, string> = {},
) {
  const url = new URL(`${API_FOOTBALL_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-apisports-key": apiKey(),
    },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`API-Football ${path} failed with status ${response.status}`);
  }
  const payload = (await response.json()) as {
    errors?: unknown;
    results?: number;
    response?: T;
  };
  if (
    payload.errors &&
    !(Array.isArray(payload.errors) && payload.errors.length === 0) &&
    !(
      typeof payload.errors === "object" &&
      payload.errors !== null &&
      Object.keys(payload.errors).length === 0
    )
  ) {
    throw new Error(`API-Football ${path} returned an error`);
  }
  return (payload.response ?? []) as T;
}

export function formatLiveMinute(fixture: ApiFootballFixture) {
  const short = fixture.fixture.status.short ?? "LIVE";
  const elapsed = fixture.fixture.status.elapsed;
  if (elapsed == null) return short;
  const extra = fixture.fixture.status.extra;
  if (extra) return `${elapsed}+${extra}' · ${short}`;
  return `${elapsed}' · ${short}`;
}

export function matchTeams(
  leftHome: string,
  leftAway: string,
  rightHome: string,
  rightAway: string,
) {
  return (
    (namesReferToSameTeam(leftHome, rightHome) &&
      namesReferToSameTeam(leftAway, rightAway)) ||
    (namesReferToSameTeam(leftHome, rightAway) &&
      namesReferToSameTeam(leftAway, rightHome))
  );
}

export async function fetchFootballLivescores() {
  const cached = livescoreCache.get("live-all");
  if (cached) return cached;
  const data = await apiFootballGet<ApiFootballFixture[]>("/fixtures", {
    live: "all",
  });
  const matches = Array.isArray(data) ? data : [];
  return livescoreCache.set("live-all", matches, 20_000);
}

export async function fetchFootballEvents(fixtureId: string) {
  const cached = eventsCache.get(fixtureId);
  if (cached) return cached;
  const data = await apiFootballGet<ApiFootballEvent[]>("/fixtures/events", {
    fixture: fixtureId,
  });
  const events = Array.isArray(data) ? data : [];
  return eventsCache.set(fixtureId, events, 20_000);
}

export function findLiveMatch(
  matches: ApiFootballFixture[],
  home: string,
  away: string,
) {
  return (
    matches.find((match) =>
      matchTeams(
        home,
        away,
        match.teams.home.name ?? "",
        match.teams.away.name ?? "",
      ),
    ) ?? null
  );
}

export function formatLiveCommentary(events: ApiFootballEvent[]) {
  if (!events.length) return "Waiting for live commentary.";
  return [...events]
    .reverse()
    .slice(0, 8)
    .map((event) => {
      const minute =
        typeof event.time?.elapsed === "number"
          ? event.time.extra
            ? `${event.time.elapsed}+${event.time.extra}' `
            : `${event.time.elapsed}' `
          : "";
      const parts = [
        event.type,
        event.detail && event.detail !== event.type ? event.detail : null,
        event.team?.name,
        event.player?.name,
      ].filter(Boolean);
      return `${minute}${parts.join(" · ")}`.trim();
    })
    .join(" · ");
}

export async function fetchLiveSoccerPulse(input: {
  home: string;
  away: string;
}): Promise<LiveMatchPulse | null> {
  if (!isConfigured()) return null;
  const matches = await fetchFootballLivescores();
  const match = findLiveMatch(matches, input.home, input.away);
  if (!match) return null;

  const homeScore = String(match.goals.home ?? 0);
  const awayScore = String(match.goals.away ?? 0);
  const homeName = match.teams.home.name ?? input.home;
  const awayName = match.teams.away.name ?? input.away;
  const minuteLabel = formatLiveMinute(match);

  let commentary = `${awayName} ${awayScore}-${homeScore} ${homeName} (${minuteLabel})`;
  try {
    const events = await fetchFootballEvents(String(match.fixture.id));
    commentary = formatLiveCommentary(events) || commentary;
  } catch {
    // Score still useful if events endpoint is unavailable.
  }

  return {
    matchId: String(match.fixture.id),
    homeScore,
    awayScore,
    minuteLabel,
    scoreline: `${awayName} ${awayScore}-${homeScore} ${homeName} · ${minuteLabel}`,
    commentary,
    source: "api_football",
  };
}

export { isConfigured as isApiFootballConfigured };
