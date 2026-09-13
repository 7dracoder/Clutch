"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SlateEvent, SlateSport } from "@/domain/slate";
import { slateSports } from "@/domain/slate";
import { AppShell } from "@/features/shell/app-shell";
import { ExposureBookChart } from "@/features/slate/exposure-book-chart";
import { ExposureSparkline } from "@/features/slate/exposure-sparkline";
import { slateGameHref } from "@/features/slate/slate-href";
import { TeamMark } from "@/features/slate/team-mark";
import { CuteIcon, sportCuteIcon } from "@/features/ui/cute-icon";
import { formatKickoffEt } from "@/lib/eastern-time";
import {
  buildFixtureExposureSeries,
  formatExposureCompact,
} from "@/lib/fixture-exposure";

const sportLabels: Record<SlateSport | "all", string> = {
  all: "All sports",
  soccer: "Soccer",
  basketball: "Basketball",
  american_football: "American Football",
  tennis: "Tennis",
  mma: "MMA",
  motorsport: "Formula 1",
  baseball: "Baseball",
  hockey: "Hockey",
};

const titleCase = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export function SportsSlatePanel() {
  const [events, setEvents] = useState<SlateEvent[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState<SlateSport | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      void fetch("/api/research/slate", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload: unknown = await response.json();
          if (!response.ok) {
            const message =
              typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "string"
                ? payload.error
                : `Slate request failed with status ${response.status}`;
            throw new Error(message);
          }
          return payload as {
            events?: SlateEvent[];
            fetchedAt?: string;
            warnings?: string[];
          };
        })
        .then((payload) => {
          setEvents(payload.events ?? []);
          setFetchedAt(payload.fetchedAt ?? null);
          setWarnings(payload.warnings ?? []);
          setError(null);
          setLoading(false);
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          setError(
            cause instanceof Error ? cause.message : "Watch slate failed",
          );
          setLoading(false);
        });

    load();
    const interval = window.setInterval(load, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const filtered = useMemo(() => {
    const bySport =
      sport === "all" ? events : events.filter((event) => event.sport === sport);
    const needle = query.trim().toLowerCase();
    if (!needle) return bySport;
    return bySport.filter((event) => {
      const haystack = [
        event.headline,
        event.home.name,
        event.away.name,
        event.competition,
        event.sport,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [events, query, sport]);

  const liveEvents = filtered.filter((event) => event.status === "live");
  const upcomingEvents = filtered.filter((event) => event.status === "upcoming");
  const liveCount = events.filter((event) => event.status === "live").length;
  const upcomingCount = events.filter(
    (event) => event.status === "upcoming",
  ).length;
  const exposureBoard = useMemo(() => {
    const ranked = filtered.map((event) => ({
      event,
      series: buildFixtureExposureSeries(event),
    }));
    ranked.sort((left, right) => {
      const rank = { live: 0, upcoming: 1, final: 2 } as const;
      if (rank[left.event.status] !== rank[right.event.status]) {
        return rank[left.event.status] - rank[right.event.status];
      }
      return right.series.currentCents - left.series.currentCents;
    });
    return ranked.slice(0, 10);
  }, [filtered]);

  return (
    <AppShell
      actions={
        <label className="dash-search">
          <CuteIcon name="search" size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search teams, leagues…"
            aria-label="Search fixtures"
          />
        </label>
      }
    >
      <div className="dash-filters" role="tablist" aria-label="Sports">
        {(["all", ...slateSports] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={sport === name}
            className={`dash-chip${sport === name ? " is-active" : ""}`}
            onClick={() => setSport(name)}
          >
            <CuteIcon name={sportCuteIcon(name)} size={14} />
            {sportLabels[name]}
          </button>
        ))}
      </div>

      {warnings.length ? (
        <p className="inline-warning">{warnings[0]}</p>
      ) : null}

      <section className="dash-split dash-split--boards">
        <article className="dash-panel dash-panel--gold">
          <div className="dash-panel-head">
            <div>
              <p className="dash-kicker">
                <CuteIcon name="live" size={12} /> Live board
              </p>
              <h2>In play</h2>
            </div>
            <span className="dash-count-pill">{liveEvents.length}</span>
          </div>
          <div className="dash-fixture-stack">
            {liveEvents.map((event, index) => (
              <FixtureCard key={event.id} event={event} index={index} hot />
            ))}
            {!liveEvents.length && !loading ? (
              <p className="dash-empty">No live fixtures on this filter.</p>
            ) : null}
          </div>
        </article>

        <article className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <p className="dash-kicker gold-text">
                <CuteIcon name="calendar" size={12} /> Upcoming
              </p>
              <h2>About to happen</h2>
            </div>
            <span className="dash-count-pill dash-count-pill--muted">
              {loading ? "…" : upcomingEvents.length}
            </span>
          </div>
          <div className="dash-fixture-stack">
            {upcomingEvents.map((event, index) => (
              <FixtureCard key={event.id} event={event} index={index} />
            ))}
            {!upcomingEvents.length && !loading ? (
              <p className="dash-empty">
                No upcoming events matched this filter.
              </p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="dash-stat-row" aria-label="Slate metrics">
        <article className="dash-stat-card dash-stat-card--accent">
          <p className="dash-stat-label">
            <CuteIcon name="live" size={12} /> Live now
          </p>
          <p className="dash-stat-value">{liveCount}</p>
          <p className="dash-stat-note">Commentary via Tavily</p>
        </article>
        <article className="dash-stat-card">
          <p className="dash-stat-label">
            <CuteIcon name="calendar" size={12} /> Next 24 hours
          </p>
          <p className="dash-stat-value gold-text">{upcomingCount}</p>
          <p className="dash-stat-note">Kickoff window</p>
        </article>
        <article className="dash-stat-card">
          <p className="dash-stat-label">
            <CuteIcon name="all-sports" size={12} /> On this filter
          </p>
          <p className="dash-stat-value">{filtered.length}</p>
          <p className="dash-stat-note">{sportLabels[sport]}</p>
        </article>
        <article className="dash-stat-card">
          <p className="dash-stat-label">
            <CuteIcon name="check" size={12} /> Board health
          </p>
          <p className={`dash-stat-value ${error ? "orange-text" : "safe-text"}`}>
            {error ? "Risk" : "OK"}
          </p>
          <p className="dash-stat-note">
            {error
              ? error
              : fetchedAt
                ? `Refreshed ${new Date(fetchedAt).toLocaleTimeString()}`
                : "Fetching fixtures"}
          </p>
        </article>
      </section>

      <section className="dash-exposure-strip" aria-label="Open bet exposure by fixture">
        <p className="dash-exposure-footnote">
          * Modeled demo until live bet feed is wired.
        </p>
        {exposureBoard.length ? (
          <ExposureBookChart items={exposureBoard} />
        ) : !loading ? (
          <p className="dash-empty">No fixtures to chart on this filter.</p>
        ) : null}
      </section>
    </AppShell>
  );
}

function FixtureCard({
  event,
  index,
  hot = false,
}: {
  event: SlateEvent;
  index: number;
  hot?: boolean;
}) {
  const exposure = useMemo(() => buildFixtureExposureSeries(event), [event]);

  return (
    <Link
      href={slateGameHref(event.id)}
      className={`dash-fixture${hot ? " is-hot" : ""}`}
      style={{ animationDelay: `${40 + Math.min(index, 10) * 45}ms` }}
    >
      <div className="dash-fixture-main">
        <div className="dash-fixture-teams">
          <TeamMark name={event.away.name} logoUrl={event.away.logoUrl} />
          <span>
            {event.headline ?? `${event.away.name} vs ${event.home.name}`}
          </span>
          {!event.headline ? (
            <TeamMark name={event.home.name} logoUrl={event.home.logoUrl} />
          ) : null}
        </div>
        <div className="dash-fixture-meta">
          <span className={`slate-status slate-status--${event.status}`}>
            {event.status}
          </span>
          <span>{titleCase(event.sport)}</span>
          <span>{event.competition}</span>
          <span>
            {event.status === "live"
              ? event.detail
              : formatKickoffEt(event.startAt)}
          </span>
          {event.status !== "upcoming" ? (
            <span className="gold-text">
              {event.away.score ?? "0"}-{event.home.score ?? "0"}
            </span>
          ) : null}
          <span>
            <CuteIcon name="ticket" size={10} /> {exposure.openBets} open bets
          </span>
        </div>
        <div className="dash-fixture-spark">
          <ExposureSparkline
            points={exposure.points}
            tone={event.status === "live" ? "orange" : "gold"}
            height={28}
            width={220}
          />
          <span className="dash-fixture-spark-label">
            {formatExposureCompact(exposure.currentCents)}
          </span>
        </div>
      </div>
      <span className="dash-fixture-cta" aria-hidden="true">
        <CuteIcon name="arrow" size={14} />
      </span>
    </Link>
  );
}
