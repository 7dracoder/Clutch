import { describe, expect, it } from "vitest";
import {
  applyDeskDecisionToLedger,
  applyPersonalBetIntent,
} from "../src/domain/desk-ledger-decisions";
import type { TreasuryAlert } from "../src/domain/treasury-alerts";
import type { RhoAccount, RhoTransaction } from "../src/integrations/rho";

const accounts: RhoAccount[] = [
  {
    id: "checking",
    account_name: "Primary",
    account_type: "checking",
    balance: { amount: 10_000_000, currency: "USD" },
  },
];

const transactions: RhoTransaction[] = [
  {
    id: "tx-pending-large",
    account_id: "checking",
    account_name: "Primary",
    transaction_type: "ach_debit",
    status: "pending",
    amount: { amount: -500_000, currency: "USD" },
    counterparty_name: "PayOut Rail ACH",
    initiated_at: "2026-09-13T00:00:00.000Z",
  },
  {
    id: "tx-pending-small",
    account_id: "checking",
    account_name: "Primary",
    transaction_type: "ach_debit",
    status: "pending",
    amount: { amount: -50_000, currency: "USD" },
    counterparty_name: "OddsFeed Data Co",
    initiated_at: "2026-09-13T00:00:00.000Z",
  },
  {
    id: "tx-failed",
    account_id: "checking",
    account_name: "Primary",
    transaction_type: "wire_out",
    status: "failed",
    amount: { amount: -25_000, currency: "USD" },
    counterparty_name: "Wire Desk",
    initiated_at: "2026-09-13T00:00:00.000Z",
  },
];

function alert(
  partial: Partial<TreasuryAlert> & Pick<TreasuryAlert, "id" | "type">,
): TreasuryAlert {
  return {
    severity: "watch",
    title: "Test alert",
    reason: "reason",
    ask: "ask",
    decision: "open",
    createdAt: "2026-09-13T00:00:00.000Z",
    ...partial,
  };
}

describe("desk ledger decisions", () => {
  it("marks the matching pending cash move completed on approve", () => {
    const next = applyDeskDecisionToLedger(
      { accounts, transactions },
      alert({
        id: "alert-cash-move",
        type: "cash_move_approval",
        amountCents: 500_000,
      }),
      "approved",
    );
    expect(
      next.transactions.find((tx) => tx.id === "tx-pending-large")?.status,
    ).toBe("completed");
    expect(next.accounts[0]?.balance.amount).toBe(9_500_000);
  });

  it("cancels pending settlement legs on reject", () => {
    const next = applyDeskDecisionToLedger(
      { accounts, transactions },
      alert({ id: "alert-pending-settlement", type: "pending_settlement_review" }),
      "rejected",
    );
    expect(
      next.transactions.filter((tx) => tx.status === "cancelled").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("retries failed payments to completed on approve", () => {
    const next = applyDeskDecisionToLedger(
      { accounts, transactions },
      alert({ id: "alert-failed-payments", type: "failed_payment_review" }),
      "approved",
    );
    expect(next.transactions.find((tx) => tx.id === "tx-failed")?.status).toBe(
      "completed",
    );
  });

  it("inserts a desk decision leg for payout approval", () => {
    const next = applyDeskDecisionToLedger(
      { accounts, transactions },
      alert({
        id: "alert-payout-approval",
        type: "payout_approval",
        amountCents: 100_000,
        title: "Large payout window needs approval",
      }),
      "approved",
    );
    expect(next.transactions[0]?.counterparty_name).toMatch(/Desk ·/);
    expect(next.transactions[0]?.status).toBe("completed");
  });

  it("logs a personal bet intent on the linked Rho checking account", () => {
    const next = applyPersonalBetIntent(
      { accounts, transactions },
      {
        fixture: "Team A vs Team B",
        side: "Team A ML",
        stakeCents: 25_000,
        note: "lean from voice",
      },
    );
    expect(next.accounts[0]?.balance.amount).toBe(9_975_000);
    expect(next.transactions[0]?.status).toBe("pending");
    expect(next.transactions[0]?.counterparty_name).toMatch(/Personal bet/);
    expect(next.transactions[0]?.amount.amount).toBe(-25_000);
  });
});
