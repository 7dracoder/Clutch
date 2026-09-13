import { NextResponse } from "next/server";
import { z } from "zod";
import {
  matchResearchRequestSchema,
  researchMatchContext,
} from "@/integrations/tavily";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = matchResearchRequestSchema.parse(body);
    return NextResponse.json(await researchMatchContext(input));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid research request" },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Match research failed";
    const status = message.includes("configured") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
