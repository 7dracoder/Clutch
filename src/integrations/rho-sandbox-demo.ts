import type { RhoAccount, RhoTransaction } from "@/integrations/rho";

/**
 * Deterministic sandbox desk ledger with plenty of play cash and a mixed
 * transaction book. Safe cash is intentionally far above a sample max
 * exposure so Safe / Max / Buffer read as three different numbers.
 */
export const SANDBOX_DEMO_SAFE_CASH_CENTS = 850_000_000; // $8.5M
export const SANDBOX_DEMO_MAX_EXPOSURE_CENTS = 18_500_000; // $185k
export const SANDBOX_DEMO_PAYOUT_RESERVE_CENTS = 2_500_000; // $25k

const CHECKING_ID = "demo-checking-primary";
const RESERVE_ID = "demo-checking-reserve";

const COUNTERPARTIES = [
  "DraftClear Settlements",
  "PayOut Rail ACH",
  "BetSlip Clearinghouse",
  "OddsFeed Data Co",
  "StreamRights Media",
  "Affiliate Payout Desk",
  "Card Network Fees",
  "Risk Cover Reinsure",
  "Graceway Car Service",
  "Northstar Office Supply",
  "Stadium WiFi Ops",
  "Player Props Vault",
  "Live Line Vendor",
  "KYC Verify Labs",
  "Treasury Sweep Net",
  "Wire Desk — EU Rails",
  "Cashout Queue West",
  "Cashout Queue East",
  "Bonus Liability Desk",
  "Market Maker Offset",
  "Player Deposit Gateway",
  "Sponsor Media Buy",
  "Cloud Infra Invoice",
] as const;

const STATUSES = [
  "pending",
  "pending",
  "pending",
  "posted",
  "posted",
  "completed",
  "completed",
  "failed",
  "cancelled",
  "returned",
] as const;

const TYPES = [
  "ach_debit",
  "ach_credit",
  "card_debit",
  "card_credit",
  "wire_out",
  "wire_in",
  "book_transfer",
] as const;

function hashSeed(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function pickStatus(index: number, rand: () => number) {
  if (index % 11 === 0) return "failed";
  if (index % 13 === 0) return "cancelled";
  if (index % 17 === 0) return "returned";
  if (index % 3 === 0) return "posted";
  if (index % 4 === 0) return "completed";
  if (rand() > 0.55) return "pending";
  return STATUSES[index % STATUSES.length] ?? "pending";
}

function pickType(index: number, inflow: boolean) {
  if (inflow) {
    return index % 2 === 0 ? "ach_credit" : "wire_in";
  }
  return TYPES[index % TYPES.length] ?? "card_debit";
}

export function buildSandboxDemoTransactions(
  count = 48,
): RhoTransaction[] {
  const rand = mulberry32(hashSeed("clutch-rho-sandbox-demo-v2"));
  const transactions: RhoTransaction[] = [];

  for (let index = 0; index < count; index += 1) {
    const counterparty =
      COUNTERPARTIES[index % COUNTERPARTIES.length] ?? "Ops Counterparty";
    const status = pickStatus(index, rand);
    // Roughly 1 in 4 legs are inflows (deposits / credits).
    const inflow = index % 4 === 1 || index % 9 === 0;
    const magnitude =
      index % 7 === 0
        ? Math.round(8_000 + rand() * 22_000)
        : index % 5 === 0
          ? Math.round(45_000 + rand() * 180_000)
          : Math.round(1_200 + rand() * 9_500);
    const hoursAgo = rand() * 96;
    const signed = inflow ? magnitude : -magnitude;

    transactions.push({
      id: `demo-tx-${String(index + 1).padStart(3, "0")}`,
      account_id: CHECKING_ID,
      account_name: "Primary Checking",
      transaction_type: pickType(index, inflow),
      status,
      amount: { amount: signed, currency: "USD" },
      counterparty_name: counterparty,
      initiated_at: isoHoursAgo(hoursAgo),
      card_id: null,
      card_name: null,
    });
  }

  return transactions.sort(
    (left, right) =>
      Date.parse(right.initiated_at) - Date.parse(left.initiated_at),
  );
}

export function buildSandboxDemoAccounts(
  pendingOutflowsCents: number,
  payoutReserveCents = SANDBOX_DEMO_PAYOUT_RESERVE_CENTS,
  targetSafeCashCents = SANDBOX_DEMO_SAFE_CASH_CENTS,
): RhoAccount[] {
  // Primary checking carries pending + reserve + target safe cash.
  // Extra checking accounts add visible Rho balance without changing safe-cash math
  // (safe cash is derived from total checking − pending − reserve).
  const primaryCents =
    pendingOutflowsCents + payoutReserveCents + targetSafeCashCents;

  return [
    {
      id: CHECKING_ID,
      account_name: "Primary Checking",
      account_type: "checking",
      balance: { amount: primaryCents, currency: "USD" },
    },
    {
      id: RESERVE_ID,
      account_name: "Payout Reserve Float",
      account_type: "checking",
      balance: { amount: 75_000_000, currency: "USD" },
    },
    {
      id: "demo-ops-checking",
      account_name: "Ops Working Capital",
      account_type: "checking",
      balance: { amount: 120_000_000, currency: "USD" },
    },
    {
      id: "demo-credit",
      account_name: "Ops Credit",
      account_type: "credit",
      balance: { amount: 0, currency: "USD" },
    },
  ];
}

export function pendingOutflowsFromTransactions(
  transactions: RhoTransaction[],
) {
  return transactions
    .filter(
      (transaction) =>
        transaction.status === "pending" &&
        transaction.amount.currency === "USD" &&
        transaction.amount.amount < 0,
    )
    .reduce(
      (sum, transaction) => sum + Math.abs(transaction.amount.amount),
      0,
    );
}

export function buildSandboxDemoLedger(
  payoutReserveCents = SANDBOX_DEMO_PAYOUT_RESERVE_CENTS,
) {
  const transactions = buildSandboxDemoTransactions(48);
  const pendingOutflowsCents = pendingOutflowsFromTransactions(transactions);
  const accounts = buildSandboxDemoAccounts(
    pendingOutflowsCents,
    payoutReserveCents,
    SANDBOX_DEMO_SAFE_CASH_CENTS,
  );
  // Safe cash from full checking stack (primary + float + ops).
  const checkingBalanceCents = accounts
    .filter((account) => account.account_type === "checking")
    .reduce((sum, account) => sum + account.balance.amount, 0);
  const safeCashCents =
    checkingBalanceCents - pendingOutflowsCents - payoutReserveCents;

  return {
    accounts,
    transactions,
    pendingOutflowsCents,
    safeCashCents,
    maxExposureCents: SANDBOX_DEMO_MAX_EXPOSURE_CENTS,
    liquidityBufferCents: safeCashCents - SANDBOX_DEMO_MAX_EXPOSURE_CENTS,
  };
}
