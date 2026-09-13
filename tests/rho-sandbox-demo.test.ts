import { describe, expect, it } from "vitest";
import {
  SANDBOX_DEMO_MAX_EXPOSURE_CENTS,
  SANDBOX_DEMO_SAFE_CASH_CENTS,
  buildSandboxDemoAccounts,
  buildSandboxDemoLedger,
  buildSandboxDemoTransactions,
  pendingOutflowsFromTransactions,
} from "../src/integrations/rho-sandbox-demo";

describe("rho sandbox demo ledger", () => {
  it("builds a mixed status book", () => {
    const transactions = buildSandboxDemoTransactions(48);
    expect(transactions).toHaveLength(48);
    const statuses = new Set(transactions.map((tx) => tx.status));
    expect(statuses.has("pending")).toBe(true);
    expect(statuses.size).toBeGreaterThan(3);
    expect(transactions.some((tx) => tx.amount.amount > 0)).toBe(true);
    expect(transactions.some((tx) => tx.amount.amount < 0)).toBe(true);
  });

  it("only counts pending outflows toward liquidity", () => {
    const transactions = buildSandboxDemoTransactions(48);
    const pendingOutflows = pendingOutflowsFromTransactions(transactions);
    const allNegative = transactions
      .filter((tx) => tx.amount.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount.amount), 0);
    expect(pendingOutflows).toBeLessThan(allNegative);
    expect(pendingOutflows).toBeGreaterThan(0);
  });

  it("gives distinct safe cash, max exposure, and buffer", () => {
    const demo = buildSandboxDemoLedger();
    expect(demo.safeCashCents).toBeGreaterThan(SANDBOX_DEMO_SAFE_CASH_CENTS);
    expect(demo.maxExposureCents).toBe(SANDBOX_DEMO_MAX_EXPOSURE_CENTS);
    expect(demo.liquidityBufferCents).toBe(
      demo.safeCashCents - demo.maxExposureCents,
    );
    expect(demo.safeCashCents).not.toBe(demo.maxExposureCents);
    expect(demo.liquidityBufferCents).not.toBe(demo.safeCashCents);
    expect(demo.liquidityBufferCents).not.toBe(demo.maxExposureCents);
    // Plenty of play cash.
    expect(demo.safeCashCents).toBeGreaterThan(8_000_000_00);
  });

  it("sizes primary checking from pending outflows", () => {
    const accounts = buildSandboxDemoAccounts(2_000_000, 2_500_000, 850_000_000);
    const checking = accounts.find((account) => account.id.includes("primary"));
    expect(checking?.balance.amount).toBe(854_500_000);
  });
});
