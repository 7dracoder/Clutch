import type { RiskAssessment } from "@/domain/types";
import {
  SANDBOX_DEMO_MAX_EXPOSURE_CENTS,
  SANDBOX_DEMO_PAYOUT_RESERVE_CENTS,
} from "@/integrations/rho-sandbox-demo";

export const treasuryAlertTypes = [
  "at_risk_exposure",
  "watch_exposure",
  "cash_move_approval",
  "payout_approval",
  "reserve_top_up",
  "pending_settlement_review",
  "failed_payment_review",
] as const;

export type TreasuryAlertType = (typeof treasuryAlertTypes)[number];

export type TreasuryAlertSeverity = "info" | "watch" | "critical";

export type TreasuryAlertDecision = "open" | "approved" | "rejected";

export interface TreasuryAlert {
  id: string;
  type: TreasuryAlertType;
  severity: TreasuryAlertSeverity;
  title: string;
  reason: string;
  ask: string;
  amountCents?: number;
  decision: TreasuryAlertDecision;
  createdAt: string;
}

export interface EvaluateTreasuryAlertsInput {
  risk: RiskAssessment | null;
  transactions?: Array<{
    status: string;
    amount: { amount: number; currency: string };
    counterparty_name?: string;
  }>;
  safeCashCents?: number;
  maxExposureCents?: number;
  payoutReserveCents?: number;
  /** Force a few demo approval asks even when risk is quiet (sandbox desk). */
  forceDemoApprovals?: boolean;
}

const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export function evaluateTreasuryAlerts(
  input: EvaluateTreasuryAlertsInput,
): TreasuryAlert[] {
  const now = new Date().toISOString();
  const alerts: TreasuryAlert[] = [];
  const safeCash =
    input.risk?.liquidity.safeCashCents ??
    input.safeCashCents ??
    0;
  const maxExposure =
    input.risk?.maximumExposureCents ??
    input.maxExposureCents ??
    SANDBOX_DEMO_MAX_EXPOSURE_CENTS;
  const reserve =
    input.risk?.liquidity.payoutReserveCents ??
    input.payoutReserveCents ??
    SANDBOX_DEMO_PAYOUT_RESERVE_CENTS;
  const pendingOutflows =
    input.risk?.liquidity.pendingOutflowsCents ??
    (input.transactions ?? [])
      .filter((tx) => tx.status === "pending" && tx.amount.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount.amount), 0);
  const status = input.risk?.status ?? "safe";
  const txs = input.transactions ?? [];
  const pendingCount = txs.filter((tx) => tx.status === "pending").length;
  const failedCount = txs.filter((tx) =>
    ["failed", "returned", "cancelled"].includes(tx.status),
  ).length;
  const largestPending = txs
    .filter((tx) => tx.status === "pending" && tx.amount.amount < 0)
    .sort((a, b) => a.amount.amount - b.amount.amount)[0];

  if (status === "at_risk" || (safeCash > 0 && maxExposure > safeCash)) {
    alerts.push({
      id: "alert-at-risk-exposure",
      type: "at_risk_exposure",
      severity: "critical",
      title: "Exposure exceeds safe cash",
      reason: `Max exposure ${dollars(maxExposure)} is above safe cash ${dollars(safeCash)}.`,
      ask: "Approve an emergency liquidity action: hold large cashouts and move cash into the payout rail?",
      amountCents: maxExposure - safeCash,
      decision: "open",
      createdAt: now,
    });
  } else if (status === "watch" || maxExposure > safeCash * 0.5) {
    alerts.push({
      id: "alert-watch-exposure",
      type: "watch_exposure",
      severity: "watch",
      title: "Exposure on watch",
      reason: `Max exposure ${dollars(maxExposure)} is above 50% of safe cash ${dollars(safeCash)}.`,
      ask: "Approve raising the payout reserve and pausing new high-odds liability?",
      amountCents: Math.round(maxExposure * 0.25),
      decision: "open",
      createdAt: now,
    });
  }

  if (maxExposure >= Math.max(reserve * 3, 5_000_000)) {
    alerts.push({
      id: "alert-payout-approval",
      type: "payout_approval",
      severity: status === "at_risk" ? "critical" : "watch",
      title: "Large payout window needs approval",
      reason: `Scenario payout liability ${dollars(maxExposure)} needs an operator sign-off before release.`,
      ask: "Approve the payout reserve hold for this fixture scenario?",
      amountCents: maxExposure,
      decision: "open",
      createdAt: now,
    });
  }

  if (reserve < maxExposure * 0.2) {
    const topUp = Math.round(maxExposure * 0.25 - reserve);
    alerts.push({
      id: "alert-reserve-top-up",
      type: "reserve_top_up",
      severity: "watch",
      title: "Payout reserve looks thin",
      reason: `Reserve ${dollars(reserve)} is under 20% of max exposure ${dollars(maxExposure)}.`,
      ask: `Approve a reserve top-up of about ${dollars(Math.max(topUp, 1_000_000))} from primary checking?`,
      amountCents: Math.max(topUp, 1_000_000),
      decision: "open",
      createdAt: now,
    });
  }

  if (pendingOutflows > Math.max(safeCash * 0.08, 2_500_000) || pendingCount >= 8) {
    alerts.push({
      id: "alert-cash-move",
      type: "cash_move_approval",
      severity: "watch",
      title: "Cash move suggested",
      reason: `${pendingCount} pending legs · ${dollars(pendingOutflows)} still outbound.`,
      ask: largestPending
        ? `Approve moving ${dollars(Math.abs(largestPending.amount.amount))} toward the payout float (counterparty ${largestPending.counterparty_name})?`
        : "Approve sweeping working capital into the payout float?",
      amountCents: largestPending
        ? Math.abs(largestPending.amount.amount)
        : Math.round(pendingOutflows * 0.35),
      decision: "open",
      createdAt: now,
    });
  }

  if (pendingCount >= 12) {
    alerts.push({
      id: "alert-pending-settlement",
      type: "pending_settlement_review",
      severity: "info",
      title: "Settlement queue is busy",
      reason: `${pendingCount} pending Rho transactions need a desk pass.`,
      ask: "Approve batch-review of the pending settlement queue?",
      decision: "open",
      createdAt: now,
    });
  }

  if (failedCount > 0) {
    alerts.push({
      id: "alert-failed-payments",
      type: "failed_payment_review",
      severity: failedCount >= 3 ? "watch" : "info",
      title: "Failed / returned payments",
      reason: `${failedCount} Rho legs are failed, returned, or cancelled.`,
      ask: "Approve retrying failed payments after a quick ledger check?",
      decision: "open",
      createdAt: now,
    });
  }

  if (input.forceDemoApprovals) {
    const ensured = new Set(alerts.map((alert) => alert.type));
    if (!ensured.has("payout_approval")) {
      alerts.push({
        id: "alert-payout-approval",
        type: "payout_approval",
        severity: "watch",
        title: "Large payout window needs approval",
        reason: `Sandbox scenario liability ${dollars(maxExposure)} is ready for operator sign-off.`,
        ask: "Approve holding this payout scenario against the reserve?",
        amountCents: maxExposure,
        decision: "open",
        createdAt: now,
      });
    }
    if (!ensured.has("cash_move_approval")) {
      alerts.push({
        id: "alert-cash-move",
        type: "cash_move_approval",
        severity: "info",
        title: "Cash move suggested",
        reason: "Sandbox desk has outbound pending legs that can be floated.",
        ask: "Approve a sandbox cash move into the payout float?",
        amountCents: 3_500_000,
        decision: "open",
        createdAt: now,
      });
    }
    if (!ensured.has("reserve_top_up")) {
      alerts.push({
        id: "alert-reserve-top-up",
        type: "reserve_top_up",
        severity: "info",
        title: "Payout reserve top-up",
        reason: "Keep reserve headroom ahead of the next live spike.",
        ask: "Approve a sandbox reserve top-up from primary checking?",
        amountCents: 5_000_000,
        decision: "open",
        createdAt: now,
      });
    }
  }

  return alerts;
}

export function applyAlertDecision(
  alerts: TreasuryAlert[],
  alertId: string,
  decision: Exclude<TreasuryAlertDecision, "open">,
): TreasuryAlert[] {
  return alerts.map((alert) =>
    alert.id === alertId ? { ...alert, decision } : alert,
  );
}

const LIVE_RISK_ALERT_TYPES = new Set<TreasuryAlertType>([
  "at_risk_exposure",
  "watch_exposure",
]);

export function isLiveRiskAlert(alert: TreasuryAlert) {
  return LIVE_RISK_ALERT_TYPES.has(alert.type);
}

export function isDeskApprovalAlert(alert: TreasuryAlert) {
  return !isLiveRiskAlert(alert);
}

export function openAlerts(alerts: TreasuryAlert[]) {
  return alerts.filter((alert) => alert.decision === "open");
}

export function openLiveRiskAlerts(alerts: TreasuryAlert[]) {
  return openAlerts(alerts).filter(isLiveRiskAlert);
}

export function openDeskApprovals(alerts: TreasuryAlert[]) {
  return openAlerts(alerts).filter(isDeskApprovalAlert);
}

export function summarizeAlertsForVoice(alerts: TreasuryAlert[]) {
  const open = openAlerts(alerts);
  if (!open.length) return "No open treasury alerts.";
  return open
    .map((alert, index) => formatAlertForVoice(alert, index + 1))
    .join(" ");
}

export function summarizeLiveRiskAlertsForVoice(alerts: TreasuryAlert[]) {
  const open = openLiveRiskAlerts(alerts);
  if (!open.length) return "No live exposure alerts.";
  return open
    .map((alert, index) => formatAlertForVoice(alert, index + 1))
    .join(" ");
}

export function summarizeDeskApprovalsForVoice(alerts: TreasuryAlert[]) {
  const open = openDeskApprovals(alerts);
  if (!open.length) return "No open desk approvals.";
  return open
    .map((alert, index) => formatAlertForVoice(alert, index + 1))
    .join(" ");
}

function formatAlertForVoice(alert: TreasuryAlert, index: number) {
  const amount =
    alert.amountCents != null
      ? ` Amount ${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(alert.amountCents / 100)}.`
      : "";
  return `${index}. [${alert.id}] ${alert.title} (${alert.severity}, type ${alert.type}, decision ${alert.decision}). Reason: ${alert.reason}.${amount} Ask: ${alert.ask}`;
}
