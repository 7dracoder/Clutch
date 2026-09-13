import { NextResponse } from "next/server";
import {
  assessmentRequestSchema,
  assessTreasuryRisk,
} from "@/application/assess-treasury-risk";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = assessmentRequestSchema.parse(body);
    return NextResponse.json(await assessTreasuryRisk(input));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Risk assessment failed";
    const status =
      message.includes("configured") || message.includes("Provide either")
        ? 400
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
