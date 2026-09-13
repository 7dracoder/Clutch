import type { TreasuryAlert } from "@/domain/treasury-alerts";
import type { RhoAccount, RhoTransaction } from "@/integrations/rho";

export type DeskLedgerSnapshot = {
  accounts: RhoAccount[];
  transactions: RhoTransaction[];
};

function withStatus(
  transaction: RhoTransaction,
  status: string,
): RhoTransaction {
  return {
    ...transaction,
    status,
    initiated_at: new Date().toISOString(),
  };
}

function pendingOutflows(transactions: RhoTransaction[]) {
  return transactions
    .filter(
      (tx) =>
        tx.status === "pending" &&
        tx.amount.currency === "USD" &&
        tx.amount.amount < 0,
    )
    .sort((a, b) => a.amount.amount - b.amount.amount);
}

function failedLegs(transactions: RhoTransaction[]) {
  return transactions.filter((tx) =>
    ["failed", "returned", "cancelled"].includes(tx.status),
  );
}

function bumpChecking(
  accounts: RhoAccount[],
  deltaCents: number,
): RhoAccount[] {
  if (deltaCents === 0) return accounts;
  let applied = false;
  return accounts.map((account) => {
    if (
      applied ||
      account.account_type !== "checking" ||
      account.balance.currency !== "USD"
    ) {
      return account;
    }
    applied = true;
    return {
      ...account,
      balance: {
        ...account.balance,
        amount: account.balance.amount + deltaCents,
      },
    };
  });
}

function insertDecisionLeg(
  ledger: DeskLedgerSnapshot,
  alert: TreasuryAlert,
  decision: "approved" | "rejected",
): DeskLedgerSnapshot {
  const amount = -(alert.amountCents ?? 0);
  if (!amount) return ledger;
  const status = decision === "approved" ? "completed" : "cancelled";
  const stamp = new Date().toISOString();
  const leg: RhoTransaction = {
    id: `desk-${alert.id}-${decision}`,
    account_id: ledger.accounts[0]?.id ?? "desk-checking",
    account_name: ledger.accounts[0]?.account_name ?? "Primary checking",
    transaction_type: "book_transfer",
    status,
    amount: { amount, currency: "USD" },
    counterparty_name: `Desk · ${alert.title}`,
    initiated_at: stamp,
  };
  const accounts =
    decision === "approved"
      ? bumpChecking(ledger.accounts, amount)
      : ledger.accounts;
  return {
    accounts,
    transactions: [leg, ...ledger.transactions],
  };
}

/**
 * Sandbox / desk simulation: map an alert decision onto visible Rho ledger rows.
 * Does not call the Rho API — local Command Center state only.
 */
export function applyDeskDecisionToLedger(
  ledger: DeskLedgerSnapshot,
  alert: TreasuryAlert,
  decision: "approved" | "rejected",
): DeskLedgerSnapshot {
  const { accounts, transactions } = ledger;

  if (alert.type === "cash_move_approval") {
    const targets = pendingOutflows(transactions);
    const primary =
      (alert.amountCents != null
        ? targets.find(
            (tx) => Math.abs(tx.amount.amount) === alert.amountCents,
          )
        : undefined) ?? targets[0];
    if (!primary) return insertDecisionLeg(ledger, alert, decision);
    const nextStatus = decision === "approved" ? "completed" : "cancelled";
    return {
      accounts:
        decision === "approved"
          ? bumpChecking(accounts, primary.amount.amount)
          : accounts,
      transactions: transactions.map((tx) =>
        tx.id === primary.id ? withStatus(tx, nextStatus) : tx,
      ),
    };
  }

  if (alert.type === "pending_settlement_review") {
    const targets = pendingOutflows(transactions).slice(0, 8);
    if (!targets.length) return ledger;
    const ids = new Set(targets.map((tx) => tx.id));
    const nextStatus = decision === "approved" ? "completed" : "cancelled";
    const balanceDelta =
      decision === "approved"
        ? targets.reduce((sum, tx) => sum + tx.amount.amount, 0)
        : 0;
    return {
      accounts: bumpChecking(accounts, balanceDelta),
      transactions: transactions.map((tx) =>
        ids.has(tx.id) ? withStatus(tx, nextStatus) : tx,
      ),
    };
  }

  if (alert.type === "failed_payment_review") {
    const targets = failedLegs(transactions);
    if (!targets.length) return ledger;
    const ids = new Set(targets.map((tx) => tx.id));
    const nextStatus = decision === "approved" ? "completed" : "cancelled";
    return {
      accounts,
      transactions: transactions.map((tx) =>
        ids.has(tx.id) ? withStatus(tx, nextStatus) : tx,
      ),
    };
  }

  if (
    alert.type === "payout_approval" ||
    alert.type === "reserve_top_up" ||
    alert.type === "at_risk_exposure" ||
    alert.type === "watch_exposure"
  ) {
    return insertDecisionLeg(ledger, alert, decision);
  }

  return ledger;
}

/**
 * Log a personal-mode bet intent against the same Rho sandbox accounts.
 * Tracking only — does not place a sportsbook wager.
 */
export function applyPersonalBetIntent(
  ledger: DeskLedgerSnapshot,
  input: {
    fixture: string;
    side: string;
    stakeCents: number;
    note?: string;
  },
): DeskLedgerSnapshot {
  const stake = Math.max(0, Math.round(input.stakeCents));
  if (!stake) return ledger;
  const stamp = new Date().toISOString();
  const label = input.note?.trim()
    ? `Personal bet · ${input.side} · ${input.note.trim()}`
    : `Personal bet · ${input.side} · ${input.fixture}`;
  const leg: RhoTransaction = {
    id: `personal-bet-${stamp}`,
    account_id: ledger.accounts[0]?.id ?? "desk-checking",
    account_name: ledger.accounts[0]?.account_name ?? "Primary checking",
    transaction_type: "book_transfer",
    status: "pending",
    amount: { amount: -stake, currency: "USD" },
    counterparty_name: label,
    initiated_at: stamp,
  };
  return {
    accounts: bumpChecking(ledger.accounts, -stake),
    transactions: [leg, ...ledger.transactions],
  };
}

