import { describe, expect, it } from "vitest";
import {
  applyAlertDecision,
  evaluateTreasuryAlerts,
  openAlerts,
  summarizeAlertsForVoice,
  summarizeDeskApprovalsForVoice,
} from "../src/domain/treasury-alerts";
import type { RiskAssessment } from "../src/domain/types";
import type { RhoTransaction } from "../src/integrations/rho";

const risk: RiskAssessment = {
  prediction: {
    event: "shot_on_goal",
    attemptProbability: 0.7,
    makeProbability: 0.2,
    confidence: 0.8,
    factors: ["penalty-area pressure"],
  },
  liquidity: {
    checkingBalanceCents: 10_000_000,
    pendingOutflowsCents: 1_000_000,
    payoutReserveCents: 500_000,
    safeCashCents: 8_500_000,
  },
  maximumExposureCents: 6_000_000,
  probabilityWeightedExposureCents: 840_000,
  liquidityBufferCents: 2_500_000,
  status: "watch",
  generatedAt: "2026-09-13T00:00:00.000Z",
};

const transactions: RhoTransaction[] = Array.from({ length: 14 }, (_, index) => ({
  id: `tx-${index}`,
  account_id: "a1",
  account_name: "Primary",
  transaction_type: "ach_debit",
  status: index % 5 === 0 ? "failed" : "pending",
  amount: { amount: index % 3 === 0 ? 50_000 : -80_000, currency: "USD" },
  counterparty_name: `Party ${index}`,
  initiated_at: "2026-09-13T00:00:00.000Z",
}));

describe("treasury alerts", () => {
  it("emits several useful approval alert types", () => {
    const alerts = evaluateTreasuryAlerts({
      risk,
      transactions,
      forceDemoApprovals: true,
    });
    const types = new Set(alerts.map((alert) => alert.type));
    expect(types.has("watch_exposure") || types.has("at_risk_exposure")).toBe(
      true,
    );
    expect(types.has("payout_approval")).toBe(true);
    expect(types.has("cash_move_approval")).toBe(true);
    expect(types.has("failed_payment_review")).toBe(true);
    expect(openAlerts(alerts).length).toBeGreaterThan(2);
    expect(summarizeAlertsForVoice(alerts)).toMatch(/Approve|approve|approval/i);
  });

  it("records approve and reject decisions", () => {
    const alerts = evaluateTreasuryAlerts({
      risk,
      transactions,
      forceDemoApprovals: true,
    });
    const first = alerts[0];
    expect(first).toBeTruthy();
    const approved = applyAlertDecision(alerts, first!.id, "approved");
    expect(approved.find((alert) => alert.id === first!.id)?.decision).toBe(
      "approved",
    );
    const rejected = applyAlertDecision(alerts, first!.id, "rejected");
    expect(rejected.find((alert) => alert.id === first!.id)?.decision).toBe(
      "rejected",
    );
  });

  it("includes reason amount and id in voice summaries for follow-up Q&A", () => {
    const alerts = evaluateTreasuryAlerts({
      risk,
      transactions,
      forceDemoApprovals: true,
    });
    const summary = summarizeDeskApprovalsForVoice(alerts);
    expect(summary).toMatch(/\[alert-/);
    expect(summary).toMatch(/Reason:/);
    expect(summary).toMatch(/Ask:/);
  });
});
