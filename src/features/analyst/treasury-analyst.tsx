"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventIntel } from "@/domain/slate";
import type { CourtState, ResearchSource, RiskAssessment } from "@/domain/types";
import {
  briefingToContextualUpdate,
  createTreasuryBriefing,
} from "@/integrations/elevenlabs";
import {
  ANALYST_IDLE_END_MS,
  ANALYST_STREAM_DUCK_MS,
  shouldMuteLiveStream,
} from "@/features/analyst/stream-duck";
import { sportDeskCopy } from "@/features/desk/sport-desk-copy";
import { CuteIcon } from "@/features/ui/cute-icon";
import { inferMatchHints } from "@/integrations/match-hints";
import { SANDBOX_DEMO_MAX_EXPOSURE_CENTS } from "@/integrations/rho-sandbox-demo";
import {
  openDeskApprovals,
  openLiveRiskAlerts,
  summarizeDeskApprovalsForVoice,
  summarizeLiveRiskAlertsForVoice,
  type TreasuryAlert,
} from "@/domain/treasury-alerts";

export type AnalystFocusTarget =
  | "ledger"
  | "court"
  | "risk"
  | "research"
  | "alerts";

interface ResearchImage {
  url: string;
  description: string;
}

interface TranscriptLine {
  role: "user" | "agent";
  text: string;
}

interface TreasuryAnalystProps {
  risk: RiskAssessment | null;
  courtState: CourtState | null;
  sourceUrl?: string;
  licenseNote?: string;
  eventIntel?: EventIntel | null;
  fixture?: string;
  sport?: string;
  alerts?: TreasuryAlert[];
  /** Increment when operator clicks alerts UI to offer an approval readout. */
  approvalReadoutRequest?: number;
  onAlertDecision?: (
    alertId: string,
    decision: "approved" | "rejected",
  ) => void;
  onFocusAlert?: (alertId: string) => void;
  onFocus: (target: AnalystFocusTarget) => void;
  onStreamMuteChange?: (muted: boolean) => void;
}

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const titleCase = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

function uniqueIntelTexts(intel: EventIntel) {
  const texts: string[] = [];
  for (const value of [intel.summary, intel.lineup, intel.injuries]) {
    const text = value.trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    if (
      texts.some(
        (existing) =>
          existing.toLowerCase().includes(lower) ||
          lower.includes(existing.toLowerCase()),
      )
    ) {
      continue;
    }
    texts.push(text);
  }
  return texts;
}

export function TreasuryAnalyst(props: TreasuryAnalystProps) {
  return (
    <ConversationProvider>
      <TreasuryAnalystSession {...props} />
    </ConversationProvider>
  );
}

function TreasuryAnalystSession({
  risk,
  courtState,
  sourceUrl,
  licenseNote,
  eventIntel,
  fixture,
  sport,
  alerts = [],
  approvalReadoutRequest = 0,
  onAlertDecision,
  onFocusAlert,
  onFocus,
  onStreamMuteChange,
}: TreasuryAnalystProps) {
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
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const nudgedLiveRiskRef = useRef(false);
  const lastApprovalRequestRef = useRef(0);

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

  const desk = useMemo(() => sportDeskCopy(sport), [sport]);
  const liveRiskSummary = useMemo(
    () => summarizeLiveRiskAlertsForVoice(alerts),
    [alerts],
  );
  const deskApprovals = useMemo(() => openDeskApprovals(alerts), [alerts]);
  const deskApprovalsSummary = useMemo(
    () => summarizeDeskApprovalsForVoice(alerts),
    [alerts],
  );
  const briefing = useMemo(
    () =>
      createTreasuryBriefing(risk, undefined, courtState, {
        fixture,
        sport,
        intel: eventIntel,
        liveRiskAlertsCount: openLiveRiskAlerts(alerts).length,
        liveRiskAlertsSummary: liveRiskSummary,
        deskApprovalsCount: deskApprovals.length,
        openAlertsCount: deskApprovals.length,
        openAlertsSummary: deskApprovalsSummary,
      }),
    [
      alerts,
      courtState,
      deskApprovals.length,
      deskApprovalsSummary,
      eventIntel,
      fixture,
      liveRiskSummary,
      risk,
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

  const {
    startSession,
    endSession,
    status,
    isSpeaking,
    isListening,
    setMuted,
    sendContextualUpdate,
    sendUserActivity,
    sendUserMessage,
  } = useConversation({
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
      openRhoLedger: () => {
        onFocus("ledger");
      },
      focusLiveCourt: () => {
        onFocus("court");
      },
      showRiskBreakdown: () => {
        onFocus("risk");
      },
      openResearchContext: () => {
        onFocus("research");
      },
      searchMatchContext,
      listOpenAlerts: () => {
        const open = openDeskApprovals(alertsRef.current);
        if (!open.length) {
          return "No open desk approvals right now. You can say that aloud.";
        }
        return `Speak this desk-approval summary to the operator now, and use it to answer follow-up questions: ${summarizeDeskApprovalsForVoice(open)}`;
      },
      presentAlert: (parameters: Record<string, unknown>) => {
        const alertId =
          typeof parameters.alert_id === "string"
            ? parameters.alert_id.trim()
            : "";
        const alert = openDeskApprovals(alertsRef.current).find(
          (item) => item.id === alertId,
        );
        if (!alert) {
          return `Approval ${alertId || "(missing)"} was not found among desk approvals. Ask the operator for permission, then call listOpenAlerts.`;
        }
        onFocus("alerts");
        onFocusAlert?.(alert.id);
        return `Speak this approval ask, then wait for approve or reject: ${alert.title}. ${alert.reason} ${alert.ask}`;
      },
      confirmAlert: (parameters: Record<string, unknown>) => {
        const alertId =
          typeof parameters.alert_id === "string"
            ? parameters.alert_id.trim()
            : "";
        const alert = alertsRef.current.find((item) => item.id === alertId);
        if (!alert) return `Cannot approve unknown alert ${alertId}.`;
        onAlertDecision?.(alert.id, "approved");
        onFocus("ledger");
        return `Speak this confirmation: Approved ${alert.title} in the Rho sandbox desk log. The ledger was updated locally. No production transfer was sent.`;
      },
      rejectAlert: (parameters: Record<string, unknown>) => {
        const alertId =
          typeof parameters.alert_id === "string"
            ? parameters.alert_id.trim()
            : "";
        const alert = alertsRef.current.find((item) => item.id === alertId);
        if (!alert) return `Cannot reject unknown alert ${alertId}.`;
        onAlertDecision?.(alert.id, "rejected");
        onFocus("ledger");
        return `Speak this confirmation: Rejected ${alert.title}. The ledger was updated locally. No cash move will be staged.`;
      },
    },
  });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/elevenlabs/status", {
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
    if (status !== "connected" || !briefing) return;
    const update = briefingToContextualUpdate(briefing);
    // Never push live briefing updates mid-utterance — they can truncate speech.
    if (isSpeaking) return;
    if (update !== lastUpdateRef.current) {
      lastUpdateRef.current = update;
      sendContextualUpdate(update);
    }

    const liveCount = openLiveRiskAlerts(alertsRef.current).length;
    const elevated =
      risk?.status === "watch" ||
      risk?.status === "at_risk" ||
      liveCount > 0;
    if (elevated && !nudgedLiveRiskRef.current) {
      nudgedLiveRiskRef.current = true;
      sendUserMessage(
        `Live exposure needs a short spoken update now. Risk status is ${risk?.status ?? "unknown"}. Brief the live risk alert only. Do not list desk approvals unless I ask.`,
      );
    }
    if (!elevated) {
      nudgedLiveRiskRef.current = false;
    }
  }, [
    briefing,
    isSpeaking,
    risk?.status,
    sendContextualUpdate,
    sendUserMessage,
    status,
  ]);

  useEffect(() => {
    if (status !== "connected" || isSpeaking) {
      if (status !== "connected") {
        nudgedLiveRiskRef.current = false;
        lastApprovalRequestRef.current = 0;
      }
      return;
    }
    if (
      !approvalReadoutRequest ||
      approvalReadoutRequest === lastApprovalRequestRef.current
    ) {
      return;
    }
    lastApprovalRequestRef.current = approvalReadoutRequest;
    const waiting = openDeskApprovals(alertsRef.current).length;
    if (waiting <= 0) return;
    sendUserMessage(
      `I clicked the desk approvals section. There are ${waiting} approvals waiting. Ask me if you can read them aloud. Do not list or present approval details until I say yes.`,
    );
  }, [approvalReadoutRequest, isSpeaking, sendUserMessage, status]);

  const ensureMicrophoneAccess = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser cannot access a microphone for voice.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    for (const track of stream.getTracks()) {
      track.stop();
    }
  };

  const startConversation = async () => {
    setSessionError(null);
    clearReplyTimeout();
    setStarting(true);
    setTranscript([]);
    try {
      await ensureMicrophoneAccess();
      const response = await fetch("/api/elevenlabs/signed-url", {
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
      lastUpdateRef.current = briefing
        ? briefingToContextualUpdate(briefing)
        : "";
      startSession({
        signedUrl,
        connectionType: "websocket",
        dynamicVariables: briefing ?? undefined,
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
  const voiceBusy = sessionActive && (isSpeaking || isListening);
  const hasOpenApprovals = openDeskApprovals(alerts).length > 0;
  const hasLiveRisk =
    risk?.status === "at_risk" ||
    risk?.status === "watch" ||
    openLiveRiskAlerts(alerts).length > 0;

  const toggleVoice = () => {
    if (sessionActive) {
      stopConversation();
      return;
    }
    void startConversation();
  };

  return (
    <div className="analyst-content" id="treasury-analyst-research">
      <p className="analyst-lead">
        {risk?.status === "at_risk"
          ? desk.leadAtRisk
          : hasLiveRisk
            ? "Live exposure is elevated — start voice and I will brief the live risk first."
            : hasOpenApprovals
              ? "Desk approvals are waiting. Start voice for live risk; click Approvals when you want me to ask before reading them."
          : fixture && !courtState
            ? desk.leadIdle
            : desk.leadReady}
      </p>
      <div className="analyst-trigger">
        <p className="eyebrow orange-text panel-eyebrow">
          <CuteIcon name="pulse" size={12} /> Primary trigger
        </p>
        <p>
          A successful{" "}
          {titleCase(risk?.prediction.event ?? desk.triggerVerb)} could create{" "}
          {money(risk?.maximumExposureCents ?? SANDBOX_DEMO_MAX_EXPOSURE_CENTS)} in gross payout
          exposure.
        </p>
      </div>

      {!sessionActive ? (
        <>
          <p className="eyebrow">Suggested actions</p>
          <ol className="action-list">
            {desk.suggestedActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </>
      ) : null}

      <div className="analyst-controls">
        <button
          type="button"
          className={`voice-pill${sessionActive ? " is-active" : ""}${
            voiceBusy ? " is-busy" : ""
          }${
            risk?.status === "at_risk" || hasLiveRisk || hasOpenApprovals
              ? " is-alert"
              : ""
          }`}
          onClick={toggleVoice}
          disabled={configured === false || starting || status === "connecting"}
          aria-pressed={sessionActive}
          aria-label={sessionActive ? "End voice session" : "Start voice"}
        >
          <span
            className={`voice-waves${sessionActive ? " is-on" : ""}`}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <CuteIcon name="speaker" size={18} />
        </button>
      </div>

      {configured === false ? (
        <p className="inline-warning">
          Run npm run analyst:provision after adding an ElevenLabs key with
          Agents permission.
        </p>
      ) : null}
      {sessionError ? <p className="inline-error">{sessionError}</p> : null}

      {sessionActive ? (
        <ol className="analyst-transcript">
          {transcript.map((line, index) => (
            <li
              key={`${line.role}-${index}`}
              className={`analyst-transcript-line analyst-transcript-line--${line.role}`}
            >
              <span className="eyebrow">
                {line.role === "user" ? "Operator" : "Analyst"}
              </span>
              <p>{line.text}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {eventIntel && !research ? (
        <div className="analyst-research">
          <p className="eyebrow">Fixture research</p>
          {uniqueIntelTexts(eventIntel).map((text) => (
            <p key={text.slice(0, 48)} className="analyst-research-summary">
              {text}
            </p>
          ))}
          {eventIntel.images.length ? (
            <div className="analyst-logos">
              {eventIntel.images.map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.url}
                  src={image.url}
                  alt={image.description}
                />
              ))}
            </div>
          ) : null}
          <ul className="analyst-sources">
            {eventIntel.sources.slice(0, 4).map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {research ? (
        <div className="analyst-research">
          <p className="eyebrow">Match research</p>
          <p className="analyst-research-summary">{research.summary}</p>
          {research.images.length ? (
            <div className="analyst-logos">
              {research.images.map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.url}
                  src={image.url}
                  alt={image.description}
                />
              ))}
            </div>
          ) : null}
          <ul className="analyst-sources">
            {research.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="disclaimer">
        Decision support only. Review market, treasury, and licensing controls
        before action.
      </p>
    </div>
  );
}
