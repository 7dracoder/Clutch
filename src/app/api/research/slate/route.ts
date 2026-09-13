import { NextResponse } from "next/server";
import { loadWatchSlate } from "@/application/load-watch-slate";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await loadWatchSlate());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Watch slate failed";
    const status = message.includes("configured") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
