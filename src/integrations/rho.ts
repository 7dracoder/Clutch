import { z } from "zod";
import { calculateLiquidity } from "@/domain/risk-engine";
import type { LiquiditySnapshot } from "@/domain/types";
import { buildSandboxDemoLedger } from "@/integrations/rho-sandbox-demo";

const moneySchema = z.object({
  amount: z.number().int(),
  currency: z.string(),
});

const accountSchema = z.object({
  id: z.string(),
  account_name: z.string(),
  account_type: z.string(),
  balance: moneySchema,
});

const transactionSchema = z
  .object({
    id: z.string(),
    account_id: z.string(),
    account_name: z.string(),
    transaction_type: z.string(),
    status: z.string(),
    amount: moneySchema,
    counterparty_name: z.string(),
    initiated_at: z.string(),
    card_id: z.string().nullable().optional(),
    card_name: z.string().nullable().optional(),
  })
  .passthrough();

const cardSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    type: z.string(),
    last_4: z.string(),
  })
  .passthrough();

export type RhoAccount = z.infer<typeof accountSchema>;
export type RhoTransaction = z.infer<typeof transactionSchema>;
export type RhoCard = z.infer<typeof cardSchema>;

function getConfig() {
  return {
    baseUrl:
      process.env.RHO_API_BASE_URL ??
      "https://rhoapi-sandbox.rho.co/api/v1",
    token: process.env.RHO_API_TOKEN ?? "sandbox",
  };
}

export function isRhoSandboxMode() {
  const { baseUrl, token } = getConfig();
  return (
    token === "sandbox" ||
    token.toLowerCase().includes("sandbox") ||
    baseUrl.includes("sandbox")
  );
}

async function getPage<T>(
  path: string,
  collection: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const { baseUrl, token } = getConfig();
  const results: T[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Rho request failed with status ${response.status}`);
    }

    const body = (await response.json()) as Record<string, unknown>;
    const pageItems = z.array(schema).parse(body[collection]);
    results.push(...pageItems);
    const page = body.page as { next_page_token?: string | null } | undefined;
    pageToken = page?.next_page_token ?? null;
  } while (pageToken);

  return results;
}

export const getRhoAccounts = async () => {
  if (isRhoSandboxMode()) {
    return buildSandboxDemoLedger().accounts;
  }
  return getPage("/accounts", "accounts", accountSchema);
};

export const getRhoCards = () => getPage("/cards", "cards", cardSchema);

export const getPendingRhoTransactions = async () => {
  if (isRhoSandboxMode()) {
    return buildSandboxDemoLedger().transactions;
  }
  return getPage(
    "/transactions?status=pending",
    "transactions",
    transactionSchema,
  );
};

export async function getRhoLiquidity(
  payoutReserveCents: number,
): Promise<{
  liquidity: LiquiditySnapshot;
  accounts: RhoAccount[];
  pendingTransactions: RhoTransaction[];
}> {
  if (isRhoSandboxMode()) {
    const demo = buildSandboxDemoLedger(payoutReserveCents);
    const checkingBalanceCents = demo.accounts
      .filter(
        (account) =>
          account.account_type === "checking" &&
          account.balance.currency === "USD",
      )
      .reduce((total, account) => total + account.balance.amount, 0);

    return {
      liquidity: calculateLiquidity(
        checkingBalanceCents,
        demo.pendingOutflowsCents,
        payoutReserveCents,
      ),
      accounts: demo.accounts,
      pendingTransactions: demo.transactions,
    };
  }

  const [accounts, pendingTransactions] = await Promise.all([
    getPage("/accounts", "accounts", accountSchema),
    getPage(
      "/transactions?status=pending",
      "transactions",
      transactionSchema,
    ),
  ]);

  const checkingBalanceCents = accounts
    .filter(
      (account) =>
        account.account_type === "checking" &&
        account.balance.currency === "USD",
    )
    .reduce((total, account) => total + account.balance.amount, 0);

  const pendingOutflowsCents = pendingTransactions
    .filter(
      (transaction) =>
        transaction.amount.currency === "USD" &&
        transaction.amount.amount < 0,
    )
    .reduce(
      (total, transaction) => total + Math.abs(transaction.amount.amount),
      0,
    );

  return {
    liquidity: calculateLiquidity(
      checkingBalanceCents,
      pendingOutflowsCents,
      payoutReserveCents,
    ),
    accounts,
    pendingTransactions,
  };
}
