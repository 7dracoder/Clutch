import { NextResponse } from "next/server";
import {
  getPendingRhoTransactions,
  getRhoAccounts,
  getRhoCards,
} from "@/integrations/rho";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [accounts, transactions, cards] = await Promise.all([
      getRhoAccounts(),
      getPendingRhoTransactions(),
      getRhoCards(),
    ]);
    return NextResponse.json({ accounts, transactions, cards });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Rho ledger request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
