"use client";

import { useEffect, useState } from "react";
import type { EventIntel, SlateEvent } from "@/domain/slate";

export function fixtureLabel(
  event: Pick<SlateEvent, "away" | "home"> & { headline?: string },
) {
  return event.headline ?? `${event.away.name} vs ${event.home.name}`;
}

function applyLiveScore(event: SlateEvent, intel: EventIntel | null): SlateEvent {
  if (!intel?.liveScore) return event;
  return {
    ...event,
    detail: intel.liveScore.detail || event.detail,
    home: { ...event.home, score: intel.liveScore.home },
    away: { ...event.away, score: intel.liveScore.away },
  };
}

export function useSlateGame(gameId?: string) {
  const [loaded, setLoaded] = useState<{
    id: string;
    event: SlateEvent;
    intel: EventIntel | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;

    const controller = new AbortController();
    const loadEvent = () =>
      void fetch(`/api/research/game?id=${encodeURIComponent(gameId)}`, {
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
                : `Game request failed with status ${response.status}`;
            throw new Error(message);
          }
          return payload as { event: SlateEvent; intel?: EventIntel | null };
        })
        .then((payload) => {
          const intel = payload.intel ?? null;
          setLoaded({
            id: gameId,
            event: applyLiveScore(payload.event, intel),
            intel,
          });
          setError(null);
          return payload;
        })
        .then((payload) => {
          // Live fixtures keep refreshing commentary/score; upcoming keeps cached intel.
          if (!payload.event) return;
          if (payload.intel && payload.event.status !== "live") return;
          return fetch("/api/research/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              id: payload.event.id,
              sport: payload.event.sport,
              home: payload.event.home.name,
              away: payload.event.away.name,
              competition: payload.event.competition,
              status: payload.event.status,
            }),
          })
            .then(async (response) => {
              const intel: unknown = await response.json();
              if (!response.ok) return;
              const next = intel as EventIntel;
              setLoaded((current) =>
                current?.id === gameId
                  ? {
                      ...current,
                      event: applyLiveScore(current.event, next),
                      intel: next,
                    }
                  : current,
              );
            })
            .catch((cause) => {
              if (cause instanceof DOMException && cause.name === "AbortError") {
                return;
              }
            });
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          setError(cause instanceof Error ? cause.message : "Fixture failed to load");
        });

    loadEvent();
    const interval = window.setInterval(loadEvent, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [gameId]);

  const matches = loaded && loaded.id === gameId ? loaded : null;
  return {
    event: matches?.event ?? null,
    intel: matches?.intel ?? null,
    error: gameId ? error : null,
  };
}
