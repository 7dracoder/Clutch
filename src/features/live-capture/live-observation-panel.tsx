"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { formatClockEt } from "@/lib/eastern-time";
import { CourtTwin } from "@/components/court-twin";
import { PersonalBettingAnalyst } from "@/features/analyst/personal-betting-analyst";
import {
  TreasuryAnalyst,
  type AnalystFocusTarget,
} from "@/features/analyst/treasury-analyst";
import { sportDeskCopy } from "@/features/desk/sport-desk-copy";
import { writeLiveDetection } from "@/features/live-capture/live-detection-store";
import { useLiveRiskAssessment } from "@/features/live-capture/use-live-risk-assessment";
import { useLiveScreenObservation } from "@/features/live-capture/use-live-screen-observation";
import { AppShell } from "@/features/shell/app-shell";
import { fixtureLabel, useSlateGame } from "@/features/slate/use-slate-game";
import type { SlateSport } from "@/domain/slate";
import {
  evidenceFromMatchIntel,
  deriveNewsPredictionModifiers,
} from "@/domain/news-modifiers";
import {
  evaluateTreasuryAlerts,
} from "@/domain/treasury-alerts";
import {
  applyDeskDecisionToLedger,
  applyPersonalBetIntent,
  type DeskLedgerSnapshot,
} from "@/domain/desk-ledger-decisions";
import { TreasuryAlertsPanel } from "@/features/alerts/treasury-alerts-panel";
import { MatchWinProbabilityBar } from "@/features/desk/match-win-probability-bar";
import { useDeskMode } from "@/features/desk/use-desk-mode";
import {
  derivePersonalLead,
  personalStanceLabel,
} from "@/domain/desk-mode";
import {
  SOCCER_CALIBRATION_PRESETS,
  buildCalibrationPoints,
  videoClickToFramePoint,
  type CalibrationPresetId,
} from "@/features/live-capture/pitch-calibration";
import { CuteIcon, type CuteIconName } from "@/features/ui/cute-icon";
import {
  SANDBOX_DEMO_MAX_EXPOSURE_CENTS,
  SANDBOX_DEMO_PAYOUT_RESERVE_CENTS,
} from "@/integrations/rho-sandbox-demo";

interface WorkerHealth {
  status: string;
  sport: string;
  detector: string;
  device: string;
  modelReady: boolean;
  researchOnly: boolean;
}

const money = (cents: number, compact = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(cents / 100);

const titleCase = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

/** Keep the live banner scannable — reject preview/lineup dumps. */
function formatLivePulseCopy(raw: string) {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Waiting for live commentary.";
  const looksLikePreview =
    /scheduled for|starting xi|lineup includes|head-to-head|league points|recent form/i.test(
      cleaned,
    ) || cleaned.length > 280;
  if (looksLikePreview) {
    const firstBeat = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
    if (
      firstBeat.length <= 160 &&
      !/scheduled for|starting xi|lineup includes/i.test(firstBeat)
    ) {
      return firstBeat;
    }
    return "Live match in progress — full preview stays in research context.";
  }
  if (cleaned.length <= 220) return cleaned;
  return `${cleaned.slice(0, 217).trimEnd()}…`;
}

export function LiveObservationPanel({ gameId }: { gameId?: string }) {
  const searchParams = useSearchParams();
  const selectedGameId = gameId ?? searchParams.get("game") ?? undefined;
  const {
    videoRef,
    status,
    error,
    latestTracking,
    droppedFrames,
    latencyMs,
    startCapture,
    stopCapture,
    calibrate,
    takeKeyFrame,
    setStreamMuted,
  } = useLiveScreenObservation();
  const [analystWantsMute, setAnalystWantsMute] = useState(false);
  const [calibrationPreset, setCalibrationPreset] =
    useState<CalibrationPresetId>("attacking_box");
  const [calibrationClicks, setCalibrationClicks] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibrationMessage, setCalibrationMessage] = useState<string | null>(
    null,
  );
  const [ledger, setLedger] = useState<DeskLedgerSnapshot | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth | null>(null);
  const [analystFocus, setAnalystFocus] = useState<AnalystFocusTarget | null>(
    null,
  );
  const [alertDecisions, setAlertDecisions] = useState<
    Record<string, "approved" | "rejected">
  >({});
  const [focusedAlertId, setFocusedAlertId] = useState<string | null>(null);
  const [approvalReadoutRequest, setApprovalReadoutRequest] = useState(0);
  const selectedGame = useSlateGame(selectedGameId);
  const fixture = selectedGame.event ? fixtureLabel(selectedGame.event) : null;
  const deskSport = (selectedGame.event?.sport ?? "soccer") as SlateSport;
  const desk = sportDeskCopy(deskSport);
  const visionSport =
    deskSport === "basketball" ? "basketball" : "soccer";
  const liveVisionEnabled =
    status === "observing" &&
    (deskSport === "soccer" || deskSport === "basketball");
  const newsModifiers = useMemo(
    () =>
      deriveNewsPredictionModifiers(
        evidenceFromMatchIntel(selectedGame.intel),
      ),
    [selectedGame.intel],
  );

  const liveRisk = useLiveRiskAssessment({
    tracking: latestTracking,
    takeKeyFrame,
    enabled: liveVisionEnabled,
    sport: visionSport,
    newsModifiers,
  });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/rho/ledger", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Rho ledger is unavailable");
        return (await response.json()) as DeskLedgerSnapshot;
      })
      .then(setLedger)
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setLedgerError(
          cause instanceof Error ? cause.message : "Rho ledger is unavailable",
        );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const loadHealth = () =>
      void fetch("/api/vision/health", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Vision worker unavailable");
          setWorkerHealth((await response.json()) as WorkerHealth);
        })
        .catch(() => setWorkerHealth(null));
    loadHealth();
    const interval = window.setInterval(loadHealth, 5_000);
    return () => window.clearInterval(interval);
  }, []);

  const treasury = useMemo(() => {
    const checkingBalanceCents =
      ledger?.accounts
        .filter(
          (account) =>
            account.account_type === "checking" &&
            account.balance.currency === "USD",
        )
        .reduce((sum, account) => sum + account.balance.amount, 0) ?? 0;
    const pendingOutflowsCents =
      ledger?.transactions
        .filter(
          (transaction) =>
            transaction.status === "pending" &&
            transaction.amount.currency === "USD" &&
            transaction.amount.amount < 0,
        )
        .reduce(
          (sum, transaction) => sum + Math.abs(transaction.amount.amount),
          0,
        ) ?? 0;
    const payoutReserveCents =
      liveRisk.risk?.liquidity.payoutReserveCents ??
      SANDBOX_DEMO_PAYOUT_RESERVE_CENTS;
    // Prefer live ledger arithmetic so desk approve/reject updates metrics.
    const safeCashCents =
      checkingBalanceCents - pendingOutflowsCents - payoutReserveCents;
    const maxExposureCents =
      liveRisk.risk?.maximumExposureCents ?? SANDBOX_DEMO_MAX_EXPOSURE_CENTS;
    const liquidityBufferCents = safeCashCents - maxExposureCents;
    const bufferPercent =
      checkingBalanceCents > 0 ? (safeCashCents / checkingBalanceCents) * 100 : 0;
    return {
      checkingBalanceCents,
      pendingOutflowsCents,
      payoutReserveCents,
      safeCashCents,
      maxExposureCents,
      liquidityBufferCents,
      bufferPercent,
    };
  }, [ledger, liveRisk.risk]);

  const evaluatedAlerts = useMemo(() => {
    const next = evaluateTreasuryAlerts({
      risk: liveRisk.risk
        ? {
            ...liveRisk.risk,
            liquidity: {
              ...liveRisk.risk.liquidity,
              checkingBalanceCents: treasury.checkingBalanceCents,
              pendingOutflowsCents: treasury.pendingOutflowsCents,
              payoutReserveCents: treasury.payoutReserveCents,
              safeCashCents: treasury.safeCashCents,
            },
            liquidityBufferCents: treasury.liquidityBufferCents,
            status:
              treasury.liquidityBufferCents < 0
                ? "at_risk"
                : treasury.maxExposureCents > treasury.safeCashCents * 0.5
                  ? "watch"
                  : "safe",
          }
        : null,
      transactions: ledger?.transactions,
      safeCashCents: treasury.safeCashCents,
      maxExposureCents: treasury.maxExposureCents,
      payoutReserveCents: treasury.payoutReserveCents,
      forceDemoApprovals: true,
    });
    return next.map((alert) =>
      alertDecisions[alert.id]
        ? { ...alert, decision: alertDecisions[alert.id]! }
        : alert,
    );
  }, [
    alertDecisions,
    ledger?.transactions,
    liveRisk.risk,
    treasury.checkingBalanceCents,
    treasury.liquidityBufferCents,
    treasury.maxExposureCents,
    treasury.payoutReserveCents,
    treasury.pendingOutflowsCents,
    treasury.safeCashCents,
  ]);

  const decideAlert = (alertId: string, decision: "approved" | "rejected") => {
    const alert = evaluatedAlerts.find((item) => item.id === alertId);
    setAlertDecisions((current) => ({ ...current, [alertId]: decision }));
    setFocusedAlertId(alertId);
    setAnalystFocus("ledger");
    if (alert) {
      setLedger((current) =>
        current ? applyDeskDecisionToLedger(current, alert, decision) : current,
      );
    }
  };

  const streamBusy =
    status === "requesting_permission" ||
    status === "connecting" ||
    status === "observing";

  const connectAirServer = () => {
    if (streamBusy) return;
    void startCapture({
      sourceUrl: `airserver:${selectedGameId ?? "desk"}`,
      licenseNote: fixture
        ? `AirServer live receiver for ${fixture}`
        : "AirServer live receiver",
    });
  };

  const calibrationGuide = SOCCER_CALIBRATION_PRESETS[calibrationPreset];
  const nextLandmark =
    calibrationGuide.landmarks[calibrationClicks.length] ?? null;

  const beginCalibration = (preset: CalibrationPresetId = "attacking_box") => {
    setCalibrationPreset(preset);
    setCalibrationClicks([]);
    setCalibrationMode(true);
    setCalibrationMessage(SOCCER_CALIBRATION_PRESETS[preset].hint);
  };

  const cancelCalibration = () => {
    setCalibrationMode(false);
    setCalibrationClicks([]);
    setCalibrationMessage(null);
  };

  const handleCalibrationClick = (
    event: MouseEvent<HTMLVideoElement>,
  ) => {
    if (!calibrationMode || !videoRef.current || !nextLandmark) return;
    const point = videoClickToFramePoint(
      videoRef.current,
      event.clientX,
      event.clientY,
    );
    if (!point) {
      setCalibrationMessage("Click inside the video frame.");
      return;
    }
    const nextClicks = [...calibrationClicks, point];
    setCalibrationClicks(nextClicks);
    if (nextClicks.length < 4) {
      setCalibrationMessage(
        `Marked ${nextClicks.length}/4. Next: ${calibrationGuide.landmarks[nextClicks.length]?.label}`,
      );
      return;
    }
    try {
      calibrate(
        buildCalibrationPoints(calibrationGuide.landmarks, nextClicks),
      );
      setCalibrationMode(false);
      setCalibrationClicks([]);
      setCalibrationMessage(
        "Pitch calibrated for this camera angle. Recalibrate after zooms or cuts.",
      );
    } catch (cause) {
      setCalibrationClicks([]);
      setCalibrationMessage(
        cause instanceof Error ? cause.message : "Calibration failed",
      );
    }
  };

  const feedMuted = status !== "observing" || analystWantsMute;
  useEffect(() => {
    setStreamMuted(feedMuted);
  }, [feedMuted, setStreamMuted]);

  useEffect(() => {
    if (!liveRisk.courtState && !liveRisk.risk) return;
    writeLiveDetection({
      courtState: liveRisk.courtState,
      risk: liveRisk.risk,
    });
  }, [liveRisk.courtState, liveRisk.risk]);

  const risk = liveRisk.risk;
  const riskStatus = risk?.status ?? "safe";
  const prediction = risk?.prediction;
  const { isPersonal, isTreasury } = useDeskMode();
  const personalLead = useMemo(
    () =>
      derivePersonalLead({
        event: selectedGame.event,
        prediction: prediction ?? null,
      }),
    [prediction, selectedGame.event],
  );
  const workerHealthy = workerHealth?.status === "ok";
  const objects = latestTracking?.objects ?? [];

  const focusAnalystTarget = (target: AnalystFocusTarget) => {
    setAnalystFocus(target);
    const panelId = {
      ledger: "rho-ledger-panel",
      court: "live-court-panel",
      risk: "payout-exposure-panel",
      research: "treasury-analyst-panel",
      alerts: "treasury-alerts-panel",
    }[target];
    document.getElementById(panelId)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
    window.setTimeout(() => {
      setAnalystFocus((current) => (current === target ? null : current));
    }, 2400);
  };

  return (
    <AppShell
      title={
        fixture ?? (selectedGameId ? "Loading fixture" : "Command Center")
      }
      subtitle={
        selectedGame.event
          ? `${isPersonal ? "Personal lead" : desk.label} · ${selectedGame.event.competition}`
          : isPersonal
            ? "Personal · follow the system lead"
            : desk.eyebrow
      }
    >
      <div className="desk-shell dash-desk">
        {(selectedGame.event?.status === "live" &&
          (selectedGame.event.away.score != null ||
            selectedGame.intel?.liveScore)) ||
        (selectedGame.event?.status === "live" &&
          selectedGame.intel?.commentary) ? (
          <section className="dash-live-banner" aria-label="Live match pulse">
            <div className="dash-live-banner-score">
              <CuteIcon name="live" size={14} />
              {selectedGame.event?.status === "live" &&
              (selectedGame.event.away.score != null ||
                selectedGame.intel?.liveScore) ? (
                <p className="fixture-live-score gold-text">
                  {selectedGame.event.away.score ??
                    selectedGame.intel?.liveScore?.away ??
                    "0"}
                  -
                  {selectedGame.event.home.score ??
                    selectedGame.intel?.liveScore?.home ??
                    "0"}
                  <span>
                    {" "}
                    ·{" "}
                    {selectedGame.intel?.liveScore?.detail ??
                      selectedGame.event.detail}
                  </span>
                </p>
              ) : (
                <p className="fixture-live-score gold-text">LIVE</p>
              )}
            </div>
            {selectedGame.event?.status === "live" &&
            selectedGame.intel?.commentary ? (
              <div className="dash-live-banner-copy">
                <p className="dash-live-banner-kicker">Live pulse</p>
                <p className="fixture-live-commentary">
                  {formatLivePulseCopy(selectedGame.intel.commentary)}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {selectedGame.event ? (
          <MatchWinProbabilityBar
            event={selectedGame.event}
            personalMode={isPersonal}
          />
        ) : null}

        <section
          className="dash-stat-row"
          aria-label={isPersonal ? "Personal lead metrics" : "Treasury metrics"}
        >
          {isPersonal ? (
            <>
              <MetricCard
                icon="ticket"
                label="System lead"
                value={personalLead.sideLabel}
                note={personalLead.headline}
                tone="gold"
              />
              <MetricCard
                icon="chart"
                label="Lead strength"
                value={`${personalLead.strengthPct}%`}
                note={`Stance · ${personalStanceLabel(personalLead.stance)}`}
                tone={
                  personalLead.stance === "lean"
                    ? "safe"
                    : personalLead.stance === "watch"
                      ? "gold"
                      : "orange"
                }
              />
              <MetricCard
                icon="pulse"
                label={desk.scoreLabel}
                value={
                  personalLead.liveEdgePct != null
                    ? `${personalLead.liveEdgePct}%`
                    : "—"
                }
                note={
                  prediction
                    ? titleCase(prediction.event)
                    : "Waiting on live action"
                }
                tone="gold"
              />
              <MetricCard
                icon="shield"
                label="Signal confidence"
                value={
                  prediction
                    ? `${Math.round(prediction.confidence * 100)}%`
                    : "—"
                }
                note="Low confidence → prefer Pass"
                tone={
                  prediction && prediction.confidence >= 0.45 ? "safe" : "orange"
                }
              />
            </>
          ) : (
            <>
              <MetricCard
                icon="wallet"
                label="Rho balance"
                value={
                  ledger ? money(treasury.checkingBalanceCents, true) : "Loading"
                }
                note={`${ledger?.accounts.length ?? 0} accounts in scope`}
                tone="gold"
              />
              <MetricCard
                icon="pulse"
                label="Pending outflows"
                value={
                  ledger ? money(treasury.pendingOutflowsCents, true) : "Loading"
                }
                note={`${
                  ledger?.transactions.filter((tx) => tx.status === "pending")
                    .length ?? 0
                } pending · ${ledger?.transactions.length ?? 0} total`}
                tone="orange"
              />
              <MetricCard
                icon="shield"
                label="Payout reserve"
                value={money(treasury.payoutReserveCents, true)}
                note="Scenario reserve"
                tone="gold"
              />
              <MetricCard
                icon="chart"
                label="Liquidity buffer"
                value={`${Math.max(0, treasury.bufferPercent).toFixed(1)}%`}
                note={`${money(treasury.safeCashCents, true)} safe cash`}
                tone={treasury.safeCashCents >= 0 ? "safe" : "orange"}
              />
            </>
          )}
        </section>

        <section className="desk-stage-grid" aria-label="Live workspace">
          <article className="desk-card video-panel">
            <PanelHeader
              icon="stream"
              eyebrow="AirServer Live"
              title={fixture ?? "Live receiver"}
              tone="orange"
              meta={
                workerHealthy
                  ? `${workerHealth.detector} · ${Math.round(latencyMs ?? 0)}ms`
                  : "Vision worker offline"
              }
            />
            <div className="video-stage">
              <video
                ref={videoRef}
                muted={feedMuted}
                playsInline
                className={calibrationMode ? "is-calibrating" : undefined}
                aria-label="AirServer live preview"
                onClick={handleCalibrationClick}
              />
              {status !== "observing" ? (
                <button
                  type="button"
                  className={`video-empty video-empty--action${streamBusy ? " is-busy" : ""}`}
                  onClick={connectAirServer}
                  disabled={streamBusy}
                >
                  <span className="monitor-icon pulse-dot" aria-hidden="true">
                    <CuteIcon name="stream" size={32} />
                  </span>
                  <strong>
                    {streamBusy
                      ? "Connecting…"
                      : "Click here to connect to live stream"}
                  </strong>
                  {error ? <span className="video-empty-error">{error}</span> : null}
                </button>
              ) : (
                <div className="video-live-actions">
                  {visionSport === "soccer" ? (
                    calibrationMode ? (
                      <button
                        type="button"
                        className="video-calibrate button-with-icon"
                        onClick={cancelCalibration}
                      >
                        <CuteIcon name="shield" size={12} />
                        Cancel calibrate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="video-calibrate button-with-icon"
                        onClick={() => beginCalibration("attacking_box")}
                      >
                        <CuteIcon name="brain" size={12} />
                        {latestTracking && !latestTracking.calibrated
                          ? "Calibrate pitch"
                          : "Recalibrate"}
                      </button>
                    )
                  ) : null}
                  <button
                    type="button"
                    className="video-stop button-with-icon"
                    onClick={stopCapture}
                  >
                    <CuteIcon name="shield" size={12} />
                    Stop
                  </button>
                </div>
              )}
              {calibrationMode && nextLandmark ? (
                <div className="calibration-banner" role="status">
                  <strong>
                    {calibrationClicks.length + 1}/4 · {nextLandmark.label}
                  </strong>
                  <span>{calibrationGuide.hint}</span>
                  <div className="calibration-preset-row">
                    {(
                      Object.keys(SOCCER_CALIBRATION_PRESETS) as CalibrationPresetId[]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`dash-chip${calibrationPreset === preset ? " is-active" : ""}`}
                        onClick={() => beginCalibration(preset)}
                      >
                        {SOCCER_CALIBRATION_PRESETS[preset].title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {calibrationMessage && !calibrationMode ? (
                <p className="calibration-toast">{calibrationMessage}</p>
              ) : null}
              {calibrationClicks.map((point, index) => (
                <span
                  key={`cal-${index}`}
                  className="calibration-marker"
                  style={{
                    left: `${(point.x / (videoRef.current?.videoWidth || 1)) * 100}%`,
                    top: `${(point.y / (videoRef.current?.videoHeight || 1)) * 100}%`,
                  }}
                >
                  {index + 1}
                </span>
              ))}
              <div className="capture-stamp panel-eyebrow">
                <CuteIcon
                  name={status === "observing" ? "live" : "standby"}
                  size={12}
                />
                <span className="live-dot" />
                {titleCase(status)}
                {latestTracking
                  ? latestTracking.calibrated
                    ? " · calibrated"
                    : " · approx scale"
                  : ""}
              </div>
              <div className="drop-stamp panel-eyebrow">
                <CuteIcon name="pulse" size={10} />
                {droppedFrames} dropped
              </div>
              {objects.map((object) => (
                <span
                  key={object.id}
                  className={`tracking-box tracking-box--${object.kind}`}
                  style={{
                    left: `${(object.box[0] / (latestTracking?.frame.width ?? 1)) * 100}%`,
                    top: `${(object.box[1] / (latestTracking?.frame.height ?? 1)) * 100}%`,
                    width: `${((object.box[2] - object.box[0]) / (latestTracking?.frame.width ?? 1)) * 100}%`,
                    height: `${((object.box[3] - object.box[1]) / (latestTracking?.frame.height ?? 1)) * 100}%`,
                  }}
                >
                  {object.id}
                </span>
              ))}
            </div>
          </article>

          <article
            id="live-court-panel"
            className={`desk-card court-panel${analystFocus === "court" ? " is-analyst-focus" : ""}`}
          >
            <PanelHeader
              icon="brain"
              eyebrow={`${desk.twinEyebrow} · Frame ${latestTracking?.sequence ?? "standby"}`}
              title={desk.twinTitle}
              tone="gold"
              badge={titleCase(riskStatus)}
              badgeTone={riskStatus}
            />
            <div className="court-content">
              {desk.supportsPitchTwin ? (
                <CourtTwin
                  tracking={latestTracking}
                  courtState={liveRisk.courtState}
                  risk={risk}
                  preferredSport={visionSport}
                />
              ) : (
                <div className="sport-twin-placeholder">
                  <CuteIcon name="brain" size={22} className="desk-cute-glow" />
                  <p className="eyebrow gold-text panel-eyebrow">
                    <CuteIcon name="sparkle" size={12} /> {desk.twinEyebrow}
                  </p>
                  <p>
                    Live vision twin for {desk.label} attaches after AirServer
                    capture. Text research and Rho exposure stay active now.
                  </p>
                </div>
              )}
              <div className="prediction-metrics">
                <SmallMetric
                  icon="ticket"
                  label={desk.actionLabel}
                  value={
                    liveRisk.courtState
                      ? titleCase(liveRisk.courtState.likelyAction)
                      : prediction
                        ? titleCase(prediction.event)
                        : desk.defaultAction
                  }
                />
                <SmallMetric
                  icon="pulse"
                  label={desk.attemptLabel}
                  value={
                    prediction
                      ? `${Math.round(prediction.attemptProbability * 100)}%`
                      : "—"
                  }
                  tone="orange"
                />
                <SmallMetric
                  icon="chart"
                  label={desk.scoreLabel}
                  value={
                    prediction
                      ? `${Math.round(prediction.makeProbability * 100)}%`
                      : "—"
                  }
                  tone="orange"
                />
                <SmallMetric
                  icon="check"
                  label="Confidence"
                  value={
                    prediction
                      ? `${Math.round(prediction.confidence * 100)}%`
                      : "—"
                  }
                />
              </div>
              {liveRisk.warning ? (
                <p className="inline-warning">{liveRisk.warning}</p>
              ) : null}
            </div>
          </article>
        </section>

        <section className="desk-lower-grid" aria-label="Risk and analyst">
          <article
            id="payout-exposure-panel"
            className={`desk-card exposure-panel${analystFocus === "risk" ? " is-analyst-focus" : ""}`}
          >
            <PanelHeader
              icon="chart"
              eyebrow={isPersonal ? "Personal Lead" : "Payout Exposure"}
              title={isPersonal ? personalLead.headline : desk.exposureTitle}
              badge={
                isPersonal
                  ? personalStanceLabel(personalLead.stance)
                  : titleCase(riskStatus)
              }
              badgeTone={
                isPersonal
                  ? personalLead.stance === "lean"
                    ? "safe"
                    : personalLead.stance === "watch"
                      ? "watch"
                      : "at_risk"
                  : riskStatus
              }
            />
            <div className="desk-card-body">
              {isPersonal ? (
                <>
                  <div className="exposure-values">
                    <SmallMetric
                      icon="ticket"
                      label="Lead side"
                      value={personalLead.sideLabel}
                      tone="gold"
                    />
                    <SmallMetric
                      icon="chart"
                      label="Strength"
                      value={`${personalLead.strengthPct}%`}
                      tone="gold"
                    />
                    <SmallMetric
                      icon="pulse"
                      label="Live finish"
                      value={
                        personalLead.liveEdgePct != null
                          ? `${personalLead.liveEdgePct}%`
                          : "—"
                      }
                      tone="safe"
                    />
                  </div>
                  <p className="desk-note">{personalLead.blurb}</p>
                  <div className="risk-factors">
                    <p className="eyebrow panel-eyebrow">
                      <CuteIcon name="sparkle" size={12} /> Why this lead
                    </p>
                    {personalLead.reasons.map((factor, index) => (
                      <div
                        key={factor}
                        className={`risk-factor risk-factor--${index}`}
                      >
                        <span className="risk-factor-index">
                          <CuteIcon
                            name={
                              index === 0
                                ? "pulse"
                                : index === 1
                                  ? "chart"
                                  : "check"
                            }
                            size={11}
                          />
                        </span>
                        <p>{factor}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="exposure-values">
                    <SmallMetric
                      icon="wallet"
                      label="Safe cash"
                      value={money(treasury.safeCashCents, true)}
                      tone="safe"
                    />
                    <SmallMetric
                      icon="ticket"
                      label="Max exposure"
                      value={money(treasury.maxExposureCents, true)}
                      tone="gold"
                    />
                    <SmallMetric
                      icon="shield"
                      label="Buffer"
                      value={money(treasury.liquidityBufferCents, true)}
                      tone={
                        treasury.liquidityBufferCents < 0 ? "orange" : "safe"
                      }
                    />
                  </div>
                  <div className="risk-factors">
                    <p className="eyebrow panel-eyebrow">
                      <CuteIcon name="shield" size={12} /> Explainable risk
                      factors
                    </p>
                    {(prediction?.factors ?? [...desk.waitingFactors]).map(
                      (factor, index) => (
                        <div
                          key={factor}
                          className={`risk-factor risk-factor--${index}`}
                        >
                          <span className="risk-factor-index">
                            <CuteIcon
                              name={
                                index === 0
                                  ? "pulse"
                                  : index === 1
                                    ? "chart"
                                    : "check"
                              }
                              size={11}
                            />
                          </span>
                          <p>{factor}</p>
                        </div>
                      ),
                    )}
                  </div>
                </>
              )}
            </div>
          </article>

          <article
            id="rho-ledger-panel"
            className={`desk-card ledger-panel${analystFocus === "ledger" ? " is-analyst-focus" : ""}`}
          >
            <PanelHeader
              icon={isPersonal ? "ticket" : "wallet"}
              eyebrow={isPersonal ? "Personal Checklist" : "Rho Ledger"}
              title={isPersonal ? "Before You Bet" : "Transaction Book"}
            />
            <div className="desk-card-body ledger-scroll">
              {isPersonal ? (
                <div className="risk-factors">
                  {[
                    "Compare the system lead to your sportsbook price — only lean if the price still looks soft.",
                    "If signal confidence is weak or the pitch is uncalibrated, prefer Pass.",
                    "Size your own stake. Clutch never places or confirms a personal bet.",
                    personalLead.blurb,
                  ].map((item, index) => (
                    <div
                      key={item}
                      className={`risk-factor risk-factor--${index}`}
                    >
                      <span className="risk-factor-index">
                        <CuteIcon
                          name={index === 0 ? "check" : "shield"}
                          size={11}
                        />
                      </span>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              ) : (
              <table>
                <thead>
                  <tr>
                    <th>Counterparty</th>
                    <th>Initiated</th>
                    <th>Amount</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(ledger?.transactions ?? [])]
                    .sort(
                      (a, b) =>
                        Date.parse(b.initiated_at) - Date.parse(a.initiated_at),
                    )
                    .map((transaction) => (
                    <tr key={`${transaction.id}-${transaction.initiated_at}`}>
                      <td>{transaction.counterparty_name}</td>
                      <td>
                        {formatClockEt(new Date(transaction.initiated_at))}
                      </td>
                      <td
                        className={
                          transaction.amount.amount > 0 ? "safe-text" : undefined
                        }
                      >
                        {transaction.amount.amount > 0 ? "+" : "−"}
                        {money(Math.abs(transaction.amount.amount))}
                      </td>
                      <td
                        className={
                          transaction.status === "pending"
                            ? "gold-text"
                            : transaction.status === "failed" ||
                                transaction.status === "cancelled" ||
                                transaction.status === "returned"
                              ? "orange-text"
                              : transaction.status === "completed" ||
                                  transaction.status === "posted"
                                ? "safe-text"
                                : undefined
                        }
                      >
                        {titleCase(transaction.status)}
                      </td>
                    </tr>
                  ))}
                  {!ledger?.transactions.length ? (
                    <tr>
                      <td colSpan={4}>
                        <span className="panel-eyebrow">
                          <CuteIcon name="wallet" size={12} /> Loading Rho
                          transaction ledger…
                        </span>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              )}
            </div>
          </article>

          <aside
            id="treasury-analyst-panel"
            className={`desk-card analyst-panel${analystFocus === "research" ? " is-analyst-focus" : ""}`}
          >
            <PanelHeader
              icon="mic"
              eyebrow={
                isPersonal ? "AI Personal Betting Analyst" : "AI Treasury Analyst"
              }
              title={isPersonal ? "Bet Briefing" : "Live Briefing"}
              tone="gold"
            />
            <div className="desk-card-body">
              {isPersonal ? (
                <PersonalBettingAnalyst
                  risk={risk}
                  courtState={liveRisk.courtState}
                  personalLead={personalLead}
                  checkingBalanceCents={treasury.checkingBalanceCents}
                  pendingOutflowsCents={treasury.pendingOutflowsCents}
                  safeCashCents={treasury.safeCashCents}
                  sourceUrl={`airserver:${selectedGameId ?? "desk"}`}
                  licenseNote={
                    fixture
                      ? `AirServer live receiver for ${fixture}`
                      : "AirServer live receiver"
                  }
                  eventIntel={selectedGame.intel}
                  fixture={fixture ?? undefined}
                  sport={deskSport}
                  onFocus={focusAnalystTarget}
                  onLogBetIntent={({ side, stakeCents, note }) => {
                    setLedger((current) =>
                      current
                        ? applyPersonalBetIntent(current, {
                            fixture: fixture ?? "desk",
                            side,
                            stakeCents,
                            note,
                          })
                        : current,
                    );
                    focusAnalystTarget("ledger");
                  }}
                  onStreamMuteChange={setAnalystWantsMute}
                />
              ) : (
                <TreasuryAnalyst
                  risk={risk}
                  courtState={liveRisk.courtState}
                  sourceUrl={`airserver:${selectedGameId ?? "desk"}`}
                  licenseNote={
                    fixture
                      ? `AirServer live receiver for ${fixture}`
                      : "AirServer live receiver"
                  }
                  eventIntel={selectedGame.intel}
                  fixture={fixture ?? undefined}
                  sport={deskSport}
                  alerts={evaluatedAlerts}
                  approvalReadoutRequest={approvalReadoutRequest}
                  onAlertDecision={decideAlert}
                  onFocusAlert={(alertId) => {
                    setFocusedAlertId(alertId);
                    focusAnalystTarget("alerts");
                  }}
                  onFocus={focusAnalystTarget}
                  onStreamMuteChange={setAnalystWantsMute}
                />
              )}
            </div>
          </aside>
        </section>

        {isTreasury ? (
          <TreasuryAlertsPanel
            alerts={evaluatedAlerts}
            focusedAlertId={focusedAlertId}
            onApprove={(alertId) => decideAlert(alertId, "approved")}
            onReject={(alertId) => decideAlert(alertId, "rejected")}
            onFocus={(alertId) => {
              setFocusedAlertId(alertId);
              focusAnalystTarget("alerts");
              setApprovalReadoutRequest((token) => token + 1);
            }}
            onRequestReadout={() => {
              focusAnalystTarget("alerts");
              setApprovalReadoutRequest((token) => token + 1);
            }}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon?: CuteIconName;
  label: string;
  value: string;
  note: string;
  tone: "gold" | "orange" | "safe";
}) {
  return (
    <article className={`dash-stat-card${tone === "orange" ? " dash-stat-card--warn" : ""}`}>
      <p className="dash-stat-label">
        {icon ? <CuteIcon name={icon} size={12} /> : null}
        {label}
      </p>
      <p className={`dash-stat-value ${tone}-text`}>{value}</p>
      <p className={`dash-stat-note ${tone}-text`}>{note}</p>
    </article>
  );
}

function SmallMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon?: CuteIconName;
  label: string;
  value: string;
  tone?: "gold" | "orange" | "safe";
}) {
  return (
    <div className="small-metric">
      <p className="eyebrow panel-eyebrow">
        {icon ? <CuteIcon name={icon} size={11} /> : null}
        {label}
      </p>
      <p className={`small-metric-value ${tone ? `${tone}-text` : ""}`}>
        {value}
      </p>
    </div>
  );
}

function PanelHeader({
  icon,
  eyebrow,
  title,
  tone,
  meta,
  badge,
  badgeTone,
}: {
  icon?: CuteIconName;
  eyebrow: string;
  title: string;
  tone?: "gold" | "orange";
  meta?: string;
  badge?: string;
  badgeTone?: string;
}) {
  return (
    <div className="panel-header desk-card-header">
      <div className="desk-card-header-copy">
        <p className={`eyebrow panel-eyebrow ${tone ? `${tone}-text` : ""}`}>
          {icon ? <CuteIcon name={icon} size={12} /> : null}
          {eyebrow}
        </p>
        <h2>{title}</h2>
      </div>
      {meta ? <p className="panel-meta">{meta}</p> : null}
      {badge ? (
        <span className={`risk-badge risk-badge--${badgeTone}`}>{badge}</span>
      ) : null}
    </div>
  );
}
