"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventIntel } from "@/domain/slate";
import type { CourtState, ResearchSource, RiskAssessment } from "@/domain/types";
import type { PersonalLead } from "@/domain/desk-mode";
import { personalStanceLabel } from "@/domain/desk-mode";
import {
  ANALYST_IDLE_END_MS,
  ANALYST_STREAM_DUCK_MS,
  shouldMuteLiveStream,
} from "@/features/analyst/stream-duck";
import type { AnalystFocusTarget } from "@/features/analyst/treasury-analyst";
import { CuteIcon } from "@/features/ui/cute-icon";
import { inferMatchHints } from "@/integrations/match-hints";
import {
  createPersonalBettingBriefing,
  personalBriefingToContextualUpdate,
} from "@/integrations/elevenlabs";

interface ResearchImage {
  url: string;
  description: string;
}

interface TranscriptLine {
  role: "user" | "agent";
  text: string;
}

export function PersonalBettingAnalyst({
  risk,
  courtState,
  personalLead,
  checkingBalanceCents,
  pendingOutflowsCents,
  safeCashCents,
  sourceUrl,
  licenseNote,
  eventIntel,
  fixture,
  sport,
  onFocus,
  onLogBetIntent,
  onStreamMuteChange,
}: {
  risk: RiskAssessment | null;
  courtState: CourtState | null;
  personalLead: PersonalLead;
  checkingBalanceCents: number;
  pendingOutflowsCents: number;
  safeCashCents: number;
  sourceUrl?: string;
  licenseNote?: string;
  eventIntel?: EventIntel | null;
  fixture?: string;
  sport?: string;
  onFocus: (target: AnalystFocusTarget) => void;
  onLogBetIntent: (input: {
    side: string;
    stakeCents: number;
    note?: string;
  }) => void;
  onStreamMuteChange?: (muted: boolean) => void;
}) {
  return (
    <ConversationProvider>
      <PersonalBettingAnalystSession
        risk={risk}
        courtState={courtState}
        personalLead={personalLead}
        checkingBalanceCents={checkingBalanceCents}
        pendingOutflowsCents={pendingOutflowsCents}
        safeCashCents={safeCashCents}
        sourceUrl={sourceUrl}
        licenseNote={licenseNote}
        eventIntel={eventIntel}
        fixture={fixture}
        sport={sport}
        onFocus={onFocus}
        onLogBetIntent={onLogBetIntent}
        onStreamMuteChange={onStreamMuteChange}
      />
    </ConversationProvider>
  );
}

function PersonalBettingAnalystSession({
  risk,
  courtState,
  personalLead,
  checkingBalanceCents,
  pendingOutflowsCents,
  safeCashCents,
  sourceUrl,
  licenseNote,
  eventIntel,
  fixture,
  sport,
  onFocus,
  onLogBetIntent,
  onStreamMuteChange,
}: {
  risk: RiskAssessment | null;
  courtState: CourtState | null;
  personalLead: PersonalLead;
  checkingBalanceCents: number;
  pendingOutflowsCents: number;
  safeCashCents: number;
  sourceUrl?: string;
  licenseNote?: string;
  eventIntel?: EventIntel | null;
  fixture?: string;
  sport?: string;
  onFocus: (target: AnalystFocusTarget) => void;
  onLogBetIntent: (input: {
    side: string;
    stakeCents: number;
    note?: string;
  }) => void;
  onStreamMuteChange?: (muted: boolean) => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [research, setResearch] = useState<{
    summary: string;
    sources: ResearchSource[];
    images: ResearchImage[];
  } | null>(null);
  const lastUpdateRef = useRef("");
  const wasSpeakingRef = useRef(false);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [awaitingOperatorReply, setAwaitingOperatorReply] = useState(false);
  const [starting, setStarting] = useState(false);
  const leadRef = useRef(personalLead);
  leadRef.current = personalLead;

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const clearDuckTimeout = useCallback(() => {
    if (duckTimeoutRef.current) {
      clearTimeout(duckTimeoutRef.current);
      duckTimeoutRef.current = null;
    }
  }, []);

  const clearReplyTimeout = useCallback(() => {
    clearIdleTimeout();
    clearDuckTimeout();
    setAwaitingOperatorReply(false);
  }, [clearDuckTimeout, clearIdleTimeout]);

  const briefing = useMemo(
    () =>
      createPersonalBettingBriefing({
        fixture,
        sport,
        lead: personalLead,
        risk,
        courtState,
        intel: eventIntel,
        checkingBalanceCents,
        pendingOutflowsCents,
        safeCashCents,
      }),
    [
      checkingBalanceCents,
      courtState,
      eventIntel,
      fixture,
      pendingOutflowsCents,
      personalLead,
      risk,
      safeCashCents,
      sport,
    ],
  );

  const hints = useMemo(
    () => inferMatchHints({ sourceUrl, licenseNote }),
    [licenseNote, sourceUrl],
  );

  const searchMatchContext = useCallback(
    async (parameters: Record<string, unknown>) => {
      const query =
        typeof parameters.query === "string" ? parameters.query.trim() : "";
      if (!query) return "A search query is required.";
      const team =
        (typeof parameters.team === "string" && parameters.team.trim()) ||
        hints.team;
      const competition =
        (typeof parameters.competition === "string" &&
          parameters.competition.trim()) ||
        hints.competition;
      const response = await fetch("/api/research/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, team, competition }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : `Match research failed with status ${response.status}`;
        throw new Error(message);
      }
      const result = payload as {
        summary?: string;
        sources?: ResearchSource[];
        images?: ResearchImage[];
      };
      const sources = result.sources ?? [];
      const images = result.images ?? [];
      const summary = result.summary ?? "No match context was returned.";
      setResearch({ summary, sources, images });
      onFocus("research");
      const citations = sources
        .slice(0, 4)
        .map((source) => `${source.title} (${source.url})`)
        .join("; ");
      return citations
        ? `${summary} Sources: ${citations}`
        : summary;
    },
    [hints.competition, hints.team, onFocus],
  );

  const { startSession, endSession, status, isSpeaking, isListening, setMuted, sendUserActivity, sendContextualUpdate } =
    useConversation({
      onConnect: () => {
        setMuted(false);
        setSessionError(null);
      },
      onMessage: (event) => {
        const text = event.message.trim();
        if (!text) return;
        if (event.role === "user") {
          clearIdleTimeout();
          clearDuckTimeout();
          setAwaitingOperatorReply(false);
        }
        setTranscript((current) => [...current, { role: event.role, text }]);
      },
      onError: (message) => {
        setSessionError(
          typeof message === "string" ? message : "Voice session error",
        );
        setStarting(false);
      },
      clientTools: {
        openRhoBankroll: () => {
          onFocus("ledger");
        },
        focusLiveCourt: () => {
          onFocus("court");
        },
        showPersonalLead: () => {
          onFocus("risk");
        },
        searchMatchContext,
        explainPersonalLead: () => {
          const lead = leadRef.current;
          return `Speak this lead summary: ${lead.headline}. Stance ${personalStanceLabel(lead.stance)}. Strength ${lead.strengthPct}%. ${lead.blurb} Reasons: ${lead.reasons.join("; ")}.`;
        },
        logPersonalBetIntent: (parameters: Record<string, unknown>) => {
          const side =
            typeof parameters.side === "string" && parameters.side.trim()
              ? parameters.side.trim()
              : leadRef.current.sideLabel;
          const stakeDollars =
            typeof parameters.stake_dollars === "number"
              ? parameters.stake_dollars
              : Number(parameters.stake_dollars);
          if (!Number.isFinite(stakeDollars) || stakeDollars <= 0) {
            return "Need a positive stake_dollars value to log a personal bet intent.";
          }
          const note =
            typeof parameters.note === "string"
              ? parameters.note.trim()
              : undefined;
          const stakeCents = Math.round(stakeDollars * 100);
          onLogBetIntent({ side, stakeCents, note });
          onFocus("ledger");
          return `Speak this confirmation: Logged a personal bet intent for ${side} at $${stakeDollars.toFixed(2)} against the linked Rho sandbox bankroll. This does not place a sportsbook wager.`;
        },
      },
    });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/elevenlabs/status?role=personal", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { configured: false };
        return (await response.json()) as { configured?: boolean };
      })
      .then((payload) => setConfigured(Boolean(payload.configured)))
      .catch(() => setConfigured(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    onStreamMuteChange?.(
      shouldMuteLiveStream({
        conversationStatus: status,
        agentSpeaking: isSpeaking,
        awaitingOperatorReply,
      }),
    );
    return () => onStreamMuteChange?.(false);
  }, [awaitingOperatorReply, isSpeaking, onStreamMuteChange, status]);

  useEffect(() => {
    if (status === "connected") {
      setStarting(false);
    }
  }, [status]);

  // Mute the mic while the agent talks so speaker echo cannot barge in mid-reply.
  useEffect(() => {
    if (status !== "connected") return;
    setMuted(isSpeaking);
  }, [isSpeaking, setMuted, status]);

  useEffect(() => {
    if (status !== "connected" || !isListening || isSpeaking) return;
    sendUserActivity();
    setAwaitingOperatorReply(true);
    clearIdleTimeout();
  }, [clearIdleTimeout, isListening, isSpeaking, sendUserActivity, status]);

  useEffect(() => {
    if (status !== "connected") {
      wasSpeakingRef.current = false;
      clearReplyTimeout();
      return;
    }

    if (isSpeaking) {
      wasSpeakingRef.current = true;
      clearIdleTimeout();
      clearDuckTimeout();
      setAwaitingOperatorReply(true);
      return;
    }

    if (isListening) {
      clearIdleTimeout();
      return;
    }

    if (!wasSpeakingRef.current) return;
    wasSpeakingRef.current = false;

    setAwaitingOperatorReply(true);
    clearDuckTimeout();
    duckTimeoutRef.current = setTimeout(() => {
      duckTimeoutRef.current = null;
      setAwaitingOperatorReply(false);
    }, ANALYST_STREAM_DUCK_MS);

    clearIdleTimeout();
    idleTimeoutRef.current = setTimeout(() => {
      idleTimeoutRef.current = null;
      setAwaitingOperatorReply(false);
      endSession();
    }, ANALYST_IDLE_END_MS);
  }, [
    clearDuckTimeout,
    clearIdleTimeout,
    clearReplyTimeout,
    endSession,
    isListening,
    isSpeaking,
    status,
  ]);

  useEffect(() => () => clearReplyTimeout(), [clearReplyTimeout]);

  useEffect(() => {
    if (status !== "connected" || !briefing || isSpeaking) return;
    const update = personalBriefingToContextualUpdate(briefing);
    if (update === lastUpdateRef.current) return;
    lastUpdateRef.current = update;
    sendContextualUpdate(update);
  }, [briefing, isSpeaking, sendContextualUpdate, status]);

  const startConversation = async () => {
    setSessionError(null);
    setStarting(true);
    try {
      const response = await fetch("/api/elevenlabs/signed-url?role=personal", {
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Signed URL request failed";
        throw new Error(message);
      }
      const signedUrl =
        typeof payload === "object" &&
        payload !== null &&
        "signedUrl" in payload &&
        typeof payload.signedUrl === "string"
          ? payload.signedUrl
          : null;
      if (!signedUrl) {
        throw new Error("ElevenLabs did not return a signed URL");
      }
      lastUpdateRef.current = personalBriefingToContextualUpdate(briefing);
      startSession({
        signedUrl,
        connectionType: "websocket",
        dynamicVariables: briefing,
      });
      setMuted(false);
    } catch (error) {
      setStarting(false);
      const message =
        error instanceof Error ? error.message : "Unable to start conversation";
      if (/Permission|NotAllowed|denied/i.test(message)) {
        setSessionError(
          "Microphone permission is blocked. Allow mic access, then start voice again.",
        );
      } else {
        setSessionError(message);
      }
    }
  };

  const stopConversation = () => {
    clearReplyTimeout();
    setStarting(false);
    endSession();
  };

  const sessionActive =
    starting || status === "connected" || status === "connecting";

  return (
    <div className="analyst-content" id="personal-betting-analyst-research">
      <p className="analyst-lead">
        {personalLead.stance === "lean"
          ? `System lead favors ${personalLead.sideLabel}. Ask me about sizing against your linked Rho bankroll.`
          : personalLead.stance === "watch"
            ? "Lead is thin — I can help you decide Watch vs a small lean."
            : "Stance is Pass for now. I can explain why, or help you wait for a cleaner lead."}
      </p>
      <div className="analyst-trigger">
        <p className="eyebrow orange-text panel-eyebrow">
          <CuteIcon name="pulse" size={12} /> Personal betting voice
        </p>
        <p className="analyst-event">
          {fixture ?? "No fixture"} · {personalStanceLabel(personalLead.stance)}{" "}
          · {personalLead.strengthPct}%
        </p>
      </div>
      <div className="analyst-actions">
        <button
          type="button"
          className={`button button--primary button-with-icon${sessionActive ? " is-active" : ""}`}
          onClick={() => {
            if (sessionActive) stopConversation();
            else void startConversation();
          }}
          disabled={configured === false}
        >
          <CuteIcon name="mic" size={14} />
          {sessionActive ? "End personal voice" : "Start personal voice"}
        </button>
      </div>
      {configured === false ? (
        <p className="inline-warning">
          Personal agent not configured. Run{" "}
          <code>npm.cmd run analyst:provision</code> to create{" "}
          <code>ELEVENLABS_PERSONAL_AGENT_ID</code>.
        </p>
      ) : null}
      {sessionError ? <p className="inline-warning">{sessionError}</p> : null}
      <p className="analyst-note">
        Linked to the same Rho sandbox accounts as Treasury. Logging a bet intent
        updates the local ledger only — it does not place a sportsbook wager.
      </p>
      {transcript.length ? (
        <div className="analyst-transcript">
          {transcript.map((line, index) => (
            <p
              key={`${line.role}-${index}`}
              className={`analyst-line analyst-line--${line.role}`}
            >
              <span>{line.role === "user" ? "You" : "Personal AI"}</span>
              {line.text}
            </p>
          ))}
        </div>
      ) : null}
      {research ? (
        <div className="analyst-research">
          <p className="eyebrow panel-eyebrow">
            <CuteIcon name="sparkle" size={12} /> Match research
          </p>
          <p>{research.summary}</p>
        </div>
      ) : null}
    </div>
  );
}
