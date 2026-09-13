import type { EventIntel, SlateEvent } from "@/domain/slate";
import { eventIntelRequestSchema } from "@/domain/slate";
import {
  eventFitsSport,
  sameSlateTeams,
} from "@/integrations/sport-identity";
import {
  backfillSlateLogos,
  fetchWatchSlate,
  sortSlateEvents,
} from "@/integrations/sports-scoreboard";
import { fetchLiveSoccerPulse } from "@/integrations/api-football";
import {
  researchEventIntel,
  researchUpcomingSlate,
} from "@/integrations/tavily";
import { TtlCache } from "@/lib/ttl-cache";

const slateCache = new TtlCache<{
  events: SlateEvent[];
  fetchedAt: string;
  warnings: string[];
}>(15_000);
const intelCache = new TtlCache<EventIntel>(45_000);

export function mergeSlateEvents(
  scoreboard: SlateEvent[],
  researched: SlateEvent[],
) {
  const extras = researched.filter((event) => {
    if (event.status !== "upcoming") return false;
    if (!eventFitsSport(event)) return false;
    if (
      event.sport === "motorsport" &&
      scoreboard.some((candidate) => candidate.sport === "motorsport")
    ) {
      return false;
    }
    return !scoreboard.some((candidate) => sameSlateTeams(candidate, event));
  });
  return backfillSlateLogos(sortSlateEvents([...scoreboard, ...extras])).slice(
    0,
    48,
  );
}

export async function loadWatchSlate() {
  const cached = slateCache.get("slate-v5");
  if (cached) return cached;

  const warnings: string[] = [];
  const scoreboard = await fetchWatchSlate().catch((error: unknown) => {
    warnings.push(
      error instanceof Error
        ? error.message
        : "Public scoreboard is unavailable",
    );
    return [] as SlateEvent[];
  });

  let researched: SlateEvent[] = [];
  try {
    researched = await researchUpcomingSlate();
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? error.message
        : "Tavily slate research is unavailable",
    );
  }

  const events = mergeSlateEvents(scoreboard, researched);
  return slateCache.set("slate-v5", {
    events,
    fetchedAt: new Date().toISOString(),
    warnings,
  });
}

export async function loadGameDashboard(eventId: string) {
  const slate = await loadWatchSlate();
  let event = slate.events.find((item) => item.id === eventId);
  if (!event) return null;

  if (event.status === "live" && event.sport === "soccer") {
    try {
      const pulse = await fetchLiveSoccerPulse({
        home: event.home.name,
        away: event.away.name,
      });
      if (pulse) {
        event = {
          ...event,
          detail: pulse.minuteLabel,
          home: { ...event.home, score: pulse.homeScore },
          away: { ...event.away, score: pulse.awayScore },
        };
      }
    } catch {
      // Keep ESPN/Tavily slate scores if API-Football is unavailable.
    }
  }

  return {
    event,
    intel:
      event.status === "live"
        ? await loadEventIntel({
            id: event.id,
            sport: event.sport,
            home: event.home.name,
            away: event.away.name,
            competition: event.competition,
            status: event.status,
          }).catch(() =>
            peekEventIntel({
              id: event.id,
              sport: event.sport,
              home: event.home.name,
              away: event.away.name,
              competition: event.competition,
              status: event.status,
            }),
          )
        : peekEventIntel({
            id: event.id,
            sport: event.sport,
            home: event.home.name,
            away: event.away.name,
            competition: event.competition,
            status: event.status,
          }),
    warnings: slate.warnings,
    fetchedAt: slate.fetchedAt,
  };
}

function intelCacheKey(request: {
  id: string;
  sport: string;
  home: string;
  away: string;
  status?: string;
}) {
  return [
    request.id,
    request.sport,
    request.home,
    request.away,
    request.status ?? "upcoming",
  ].join(":");
}

export function peekEventIntel(input: unknown) {
  const request = eventIntelRequestSchema.parse(input);
  return intelCache.get(intelCacheKey(request)) ?? null;
}

export async function loadEventIntel(input: unknown) {
  const request = eventIntelRequestSchema.parse(input);
  const cacheKey = intelCacheKey(request);
  const cached = intelCache.get(cacheKey);
  if (cached) return cached;
  const intel = await researchEventIntel(request);
  const ttl = request.status === "live" ? 30_000 : 120_000;
  return intelCache.set(cacheKey, intel, ttl);
}
