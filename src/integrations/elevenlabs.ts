import type { EventIntel } from "@/domain/slate";
import type {
  CourtState,
  PlayerContext,
  RiskAssessment,
} from "@/domain/types";

const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

export const treasuryAnalystClientTools = [
  "openRhoLedger",
  "focusLiveCourt",
  "showRiskBreakdown",
  "openResearchContext",
  "searchMatchContext",
  "listOpenAlerts",
  "presentAlert",
  "confirmAlert",
  "rejectAlert",
] as const;

export const TREASURY_BRIEFING_KEYS = [
  "risk_status",
  "safe_available_cash",
  "pending_outflows",
  "payout_reserve",
  "maximum_exposure",
  "liquidity_buffer",
  "predicted_event",
  "attempt_probability",
  "make_probability",
  "prediction_confidence",
  "player_context",
  "research_sources",
  "court_zone",
  "team_in_possession",
  "likely_action",
  "fixture",
  "sport",
  "match_lineup",
  "match_injuries",
  "match_news",
  "match_commentary",
  "detection_source",
  "live_risk_alerts_count",
  "live_risk_alerts_summary",
  "desk_approvals_count",
  "open_alerts_count",
  "open_alerts_summary",
] as const;

export type TreasuryBriefing = Record<
  (typeof TREASURY_BRIEFING_KEYS)[number],
  string
>;

export function createTreasuryBriefing(
  risk?: RiskAssessment | null,
  context?: PlayerContext,
  courtState?: CourtState | null,
  match?: {
    fixture?: string;
    sport?: string;
    intel?: EventIntel | null;
    liveRiskAlertsCount?: number;
    liveRiskAlertsSummary?: string;
    deskApprovalsCount?: number;
    openAlertsCount?: number;
    openAlertsSummary?: string;
  },
): TreasuryBriefing {
  const intel = match?.intel;
  const sources = [
    ...(context?.sources ?? []),
    ...(intel?.sources ?? []),
  ]
    .map((source) => source.url)
    .filter((url, index, all) => all.indexOf(url) === index);
  const deskApprovalsCount =
    match?.deskApprovalsCount ?? match?.openAlertsCount ?? 0;
  return {
    risk_status: risk?.status ?? "unknown",
    safe_available_cash: risk
      ? dollars(risk.liquidity.safeCashCents)
      : "unavailable",
    pending_outflows: risk
      ? dollars(risk.liquidity.pendingOutflowsCents)
      : "unavailable",
    payout_reserve: risk
      ? dollars(risk.liquidity.payoutReserveCents)
      : "unavailable",
    maximum_exposure: risk
      ? dollars(risk.maximumExposureCents)
      : "unavailable",
    liquidity_buffer: risk
      ? dollars(risk.liquidityBufferCents)
      : "unavailable",
    predicted_event:
      risk?.prediction.event ?? courtState?.likelyAction ?? "unknown",
    attempt_probability: risk
      ? `${Math.round(risk.prediction.attemptProbability * 100)}%`
      : "unavailable",
    make_probability: risk
      ? `${Math.round(risk.prediction.makeProbability * 100)}%`
      : "unavailable",
    prediction_confidence: risk
      ? `${Math.round(risk.prediction.confidence * 100)}%`
      : "unavailable",
    player_context:
      [intel?.summary, ...(intel?.predictionNotes ?? [])]
        .filter(Boolean)
        .join(" ") ||
      context?.summary ||
      "No current text research supplied.",
    research_sources:
      sources.join(", ") || "No research sources supplied.",
    court_zone: courtState?.courtZone ?? "unknown",
    team_in_possession:
      courtState?.sport === "soccer"
        ? courtState.teamInPossession
        : courtState?.hasPossession
          ? "offense"
          : "unknown",
    likely_action: courtState?.likelyAction ?? risk?.prediction.event ?? "unknown",
    fixture: match?.fixture ?? "No fixture selected.",
    sport: match?.sport ?? courtState?.sport ?? "unknown",
    match_lineup: intel?.lineup ?? "No squad research supplied.",
    match_injuries: intel?.injuries ?? "No injury research supplied.",
    match_news: intel?.playerNews ?? "No player-news research supplied.",
    match_commentary: intel?.liveScore
      ? `Live score ${intel.liveScore.away}-${intel.liveScore.home} (${intel.liveScore.detail}). Commentary: ${intel.commentary}`
      : (intel?.commentary ?? "No commentary research supplied."),
    detection_source: courtState
      ? "live_vision plus text research"
      : "text research only",
    live_risk_alerts_count: String(match?.liveRiskAlertsCount ?? 0),
    live_risk_alerts_summary:
      match?.liveRiskAlertsSummary ?? "No live exposure alerts.",
    desk_approvals_count: String(deskApprovalsCount),
    open_alerts_count: String(deskApprovalsCount),
    open_alerts_summary:
      match?.openAlertsSummary ??
      (deskApprovalsCount > 0
        ? `${deskApprovalsCount} desk approvals waiting. Ask before reading them aloud.`
        : "No open desk approvals."),
  };
}

export function briefingToContextualUpdate(briefing: TreasuryBriefing) {
  return [
    `Fixture ${briefing.fixture} (${briefing.sport}).`,
    `Sources: ${briefing.detection_source}.`,
    `Live treasury update: status ${briefing.risk_status}.`,
    `Safe cash ${briefing.safe_available_cash}, pending outflows ${briefing.pending_outflows}, reserve ${briefing.payout_reserve}.`,
    `Predicted event ${briefing.predicted_event} in ${briefing.court_zone} with ${briefing.team_in_possession} possession.`,
    `Shot probability ${briefing.attempt_probability}, goal probability ${briefing.make_probability}, confidence ${briefing.prediction_confidence}.`,
    `Maximum exposure ${briefing.maximum_exposure}, buffer ${briefing.liquidity_buffer}.`,
    `Live risk alerts (${briefing.live_risk_alerts_count}): ${briefing.live_risk_alerts_summary}`,
    `Desk approvals waiting: ${briefing.desk_approvals_count}. Do not read approval details until the operator says yes.`,
    `Lineup: ${briefing.match_lineup}`,
    `Injuries: ${briefing.match_injuries}`,
    `Player news: ${briefing.match_news}`,
    `Commentary: ${briefing.match_commentary}`,
  ].join(" ");
}

export async function getElevenLabsSignedUrl(
  role: "treasury" | "personal" = "treasury",
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId =
    role === "personal"
      ? process.env.ELEVENLABS_PERSONAL_AGENT_ID
      : process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    throw new Error(
      role === "personal"
        ? "ELEVENLABS_API_KEY and ELEVENLABS_PERSONAL_AGENT_ID must be configured (run npm run analyst:provision)"
        : "ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be configured",
    );
  }

  const url = new URL(
    "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
  );
  url.searchParams.set("agent_id", agentId);
  const response = await fetch(url, {
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `ElevenLabs signed URL request failed with status ${response.status}`,
    );
  }

  const payload = (await response.json()) as { signed_url?: string };
  if (!payload.signed_url) {
    throw new Error("ElevenLabs did not return a signed URL");
  }
  return payload.signed_url;
}

export function isElevenLabsConfigured(role: "treasury" | "personal" = "treasury") {
  if (!process.env.ELEVENLABS_API_KEY) return false;
  if (role === "personal") {
    return Boolean(process.env.ELEVENLABS_PERSONAL_AGENT_ID);
  }
  return Boolean(process.env.ELEVENLABS_AGENT_ID);
}

export type PersonalBettingBriefing = Record<
  | "fixture"
  | "sport"
  | "lead_side"
  | "lead_strength"
  | "lead_stance"
  | "lead_headline"
  | "lead_blurb"
  | "lead_reasons"
  | "live_finish_probability"
  | "attempt_probability"
  | "prediction_confidence"
  | "predicted_event"
  | "court_zone"
  | "team_in_possession"
  | "rho_checking_balance"
  | "rho_pending_outflows"
  | "rho_safe_cash"
  | "suggested_stake_band"
  | "match_lineup"
  | "match_injuries"
  | "match_news"
  | "match_commentary"
  | "detection_source",
  string
>;

export function createPersonalBettingBriefing(input: {
  fixture?: string;
  sport?: string;
  lead?: {
    sideLabel: string;
    strengthPct: number;
    stance: string;
    headline: string;
    blurb: string;
    reasons: string[];
    liveEdgePct: number | null;
  } | null;
  risk?: RiskAssessment | null;
  courtState?: CourtState | null;
  intel?: EventIntel | null;
  checkingBalanceCents?: number;
  pendingOutflowsCents?: number;
  safeCashCents?: number;
}): PersonalBettingBriefing {
  const risk = input.risk;
  const lead = input.lead;
  const intel = input.intel;
  const checking = input.checkingBalanceCents ?? risk?.liquidity.checkingBalanceCents;
  const pending = input.pendingOutflowsCents ?? risk?.liquidity.pendingOutflowsCents;
  const safe = input.safeCashCents ?? risk?.liquidity.safeCashCents;
  const suggested =
    safe != null && safe > 0
      ? `${dollars(Math.round(safe * 0.005))}–${dollars(Math.round(safe * 0.02))} (about 0.5–2% of linked Rho safe cash)`
      : "unavailable";

  return {
    fixture: input.fixture ?? "No fixture selected.",
    sport: input.sport ?? input.courtState?.sport ?? "unknown",
    lead_side: lead?.sideLabel ?? "none",
    lead_strength: lead ? `${lead.strengthPct}%` : "unavailable",
    lead_stance: lead?.stance ?? "pass",
    lead_headline: lead?.headline ?? "No personal lead yet",
    lead_blurb: lead?.blurb ?? "Waiting on fixture signals.",
    lead_reasons: lead?.reasons.join(" · ") ?? "No reasons yet.",
    live_finish_probability:
      lead?.liveEdgePct != null
        ? `${lead.liveEdgePct}%`
        : risk
          ? `${Math.round(risk.prediction.makeProbability * 100)}%`
          : "unavailable",
    attempt_probability: risk
      ? `${Math.round(risk.prediction.attemptProbability * 100)}%`
      : "unavailable",
    prediction_confidence: risk
      ? `${Math.round(risk.prediction.confidence * 100)}%`
      : "unavailable",
    predicted_event:
      risk?.prediction.event ?? input.courtState?.likelyAction ?? "unknown",
    court_zone: input.courtState?.courtZone ?? "unknown",
    team_in_possession:
      input.courtState?.sport === "soccer"
        ? input.courtState.teamInPossession
        : input.courtState?.hasPossession
          ? "offense"
          : "unknown",
    rho_checking_balance:
      checking != null ? dollars(checking) : "unavailable",
    rho_pending_outflows:
      pending != null ? dollars(pending) : "unavailable",
    rho_safe_cash: safe != null ? dollars(safe) : "unavailable",
    suggested_stake_band: suggested,
    match_lineup: intel?.lineup ?? "No squad research supplied.",
    match_injuries: intel?.injuries ?? "No injury research supplied.",
    match_news: intel?.playerNews ?? "No player-news research supplied.",
    match_commentary: intel?.liveScore
      ? `Live score ${intel.liveScore.away}-${intel.liveScore.home} (${intel.liveScore.detail}). ${intel.commentary}`
      : (intel?.commentary ?? "No commentary research supplied."),
    detection_source: input.courtState
      ? "live_vision plus text research"
      : "text research only",
  };
}

export function personalBriefingToContextualUpdate(
  briefing: PersonalBettingBriefing,
) {
  return [
    `Personal mode update for ${briefing.fixture} (${briefing.sport}).`,
    `System lead: ${briefing.lead_side} at ${briefing.lead_strength}, stance ${briefing.lead_stance}.`,
    briefing.lead_headline,
    `Reasons: ${briefing.lead_reasons}`,
    `Live finish ${briefing.live_finish_probability}, attempt ${briefing.attempt_probability}, confidence ${briefing.prediction_confidence}.`,
    `Linked Rho bankroll: checking ${briefing.rho_checking_balance}, pending ${briefing.rho_pending_outflows}, safe cash ${briefing.rho_safe_cash}.`,
    `Suggested stake band: ${briefing.suggested_stake_band}.`,
    `Zone ${briefing.court_zone}, possession ${briefing.team_in_possession}, event ${briefing.predicted_event}.`,
    `Commentary: ${briefing.match_commentary}`,
  ].join(" ");
}
