import { NextResponse } from "next/server";
import { z } from "zod";
import { loadEventIntel } from "@/application/load-watch-slate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    return NextResponse.json(await loadEventIntel(body));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid event research request" },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Event research failed";
    const status = message.includes("configured") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
