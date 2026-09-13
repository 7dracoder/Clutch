import { NextResponse } from "next/server";
import { loadGameDashboard } from "@/application/load-watch-slate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("id")?.trim();
  if (!eventId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  try {
    const game = await loadGameDashboard(eventId);
    if (!game) {
      return NextResponse.json({ error: "Fixture was not found" }, { status: 404 });
    }
    return NextResponse.json(game);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Game research failed";
    const status = message.includes("configured") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
